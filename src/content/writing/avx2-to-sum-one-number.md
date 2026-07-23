---
title: "The Root Count Is Almost Always One"
date: "June 2026"
readTime: "6 min"
tags: ["C++", "SIMD", "Assembly", "Canopy"]
---

Canopy scans an NTFS volume by reading the Master File Table through `FSCTL_ENUM_USN_DATA`, builds a flat array of `ScanNode` entries with a `parent` index for each one, and then walks that array once to roll sizes up from children to parents. When a node's parent is `UINT32_MAX`, that node is a root, and its size is supposed to feed the volume total. The rollup code looked like this before I touched it:

```cpp
for (uint32_t i = result->node_count; i-- > 0; ) {
    ScanNode* n = &result->nodes[i];
    if (n->parent != UINT32_MAX)
        result->nodes[n->parent].size += n->size;
    else
        total_bytes += n->size; // root contributes to total
}
```

One `else` branch, one accumulator. For a scan of `C:\`, there's exactly one node with `parent == UINT32_MAX`, so this loop adds exactly one number to `total_bytes`. That's the whole total-bytes computation for the entire volume.

I decided this needed AVX2.

## Four accumulators, sixteen lanes

The reasoning I told myself was that a UNC scan of `\\server\share` could have multiple top-level roots if you pointed Canopy at a mount point with several volumes attached, so the root count wasn't *always* one, just almost always. I wrote `SmonSumU64_AVX2` in `Core/asm/simd_sum.cpp`: four `__m256i` accumulators, each holding four `uint64_t` lanes, processing 16 elements per loop iteration, with a tail loop for groups of 4 and a scalar loop for anything left over:

```cpp
uint32_t unrolled = count & ~15u; // 4 accumulators x 4 lanes each = 16 per iteration
for (; i < unrolled; i += 16) {
    acc0 = _mm256_add_epi64(acc0, _mm256_loadu_si256((const __m256i*)(data + i +  0)));
    acc1 = _mm256_add_epi64(acc1, _mm256_loadu_si256((const __m256i*)(data + i +  4)));
    acc2 = _mm256_add_epi64(acc2, _mm256_loadu_si256((const __m256i*)(data + i +  8)));
    acc3 = _mm256_add_epi64(acc3, _mm256_loadu_si256((const __m256i*)(data + i + 12)));
}
```

Then a horizontal reduction (extract the high 128 bits, add to the low 128 bits, unpack, add again) to fold the four accumulators down to one scalar. Then a `DetectAVX2()` function in `size_rollup.cpp` that runs `__cpuid(info, 7)` once at static-init time and checks bit 5 of EBX, so the routine never runs on a CPU that doesn't support it. Then a scratch-array allocation to gather the root sizes into something contiguous, because `ScanNode` structs aren't packed as a flat `uint64_t` array and SIMD wants contiguous memory:

```cpp
if (s_have_avx2 && root_count > 1) {
    uint64_t* scratch = new uint64_t[root_count];
    uint32_t  idx     = 0;
    for (uint32_t i = 0; i < result->node_count; ++i) {
        if (result->nodes[i].parent == UINT32_MAX)
            scratch[idx++] = result->nodes[i].size;
    }
    total_bytes = SmonSumU64_AVX2(scratch, root_count);
    delete[] scratch;
} else {
    for (uint32_t i = 0; i < result->node_count; ++i) {
        if (result->nodes[i].parent == UINT32_MAX)
            total_bytes += result->nodes[i].size;
    }
}
```

Read that `if`. The SIMD path only fires when `root_count > 1`. In the ordinary case, a single local drive, it takes the scalar branch anyway, which is the one-line loop I started with. I had added a heap allocation, a CPUID check, and 47 lines of intrinsics to a function that, for every user running Canopy against `C:\`, still runs the scalar path.

## Then I ported it to assembly, because compilers cannot be trusted

Two commits later I wasn't done. `/arch:AVX2` as a compile flag on `simd_sum.cpp` meant MSVC decided how to schedule the vector instructions, and I didn't like ceding that. So I rewrote the whole routine in raw MASM, `Core/asm/simd_sum.asm`, targeting the Windows x64 calling convention directly: RCX for the data pointer, EDX for count, RAX for the return value.

```asm
Unroll16:
        vmovdqu ymm4, YMMWORD PTR [rcx + r8*8]
        vmovdqu ymm5, YMMWORD PTR [rcx + r8*8 + 32]
        vmovdqu ymm6, YMMWORD PTR [rcx + r8*8 + 64]
        vmovdqu ymm7, YMMWORD PTR [rcx + r8*8 + 96]
        vpaddq  ymm0, ymm0, ymm4
        vpaddq  ymm1, ymm1, ymm5
        vpaddq  ymm2, ymm2, ymm6
        vpaddq  ymm3, ymm3, ymm7
        add     r8d, 16
        cmp     r8d, r9d
        jb      Unroll16
```

Same four accumulators, same 16-per-iteration unroll, same horizontal reduction with `vextracti128` and `vpunpckhqdq`, now hand-written instead of compiler-generated. The `.cpp` file that used to hold the implementation got reduced to a comment: `// Implementation lives in simd_sum.asm (MASM x64).`

This is the point where a second engineer, if I'd had one, would have asked what problem the assembly rewrite solved that the intrinsics version didn't. I didn't have one, so I found out from CMake instead. `project(SizeMonitorCore CXX ASM_MASM)` and `asm/simd_sum.asm` in the source list weren't enough: the build failed with `ml64` error A1000, because CMake's default MASM pipeline doesn't create the intermediate object subdirectory for source files sitting in a subfolder. I had to drive the assembler manually with `add_custom_command`, forcing the output object to `${CMAKE_CURRENT_BINARY_DIR}/simd_sum_asm.obj` and marking the `.asm` file `HEADER_FILE_ONLY` so CMake's own MASM rule wouldn't also try to compile it and collide with the custom one. Nineteen lines of CMake to work around a toolchain gap I introduced by moving 72 lines of assembly into a subdirectory that didn't need to exist.

## What I'd tell myself before starting

The honest fix was never AVX2 or MASM. It was recognizing that `total_bytes` is a sum of, in the overwhelming majority of scans, one number, and that "almost always one, but could theoretically be more for a multi-root UNC scan" describes a branch worth a comment, not a SIMD kernel with a CPU-dispatch guard and a hand-scheduled instruction stream. The AVX2 version is still in the codebase and it still only executes when `root_count > 1`. I haven't deleted it. It's a fast, correct, entirely unnecessary way to add together a list of numbers that in practice has exactly one entry in it.
