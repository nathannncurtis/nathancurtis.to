---
title: "Puppeting A Vendor's Closed .NET Render Engine With Reflection And JIT Timing Tricks"
date: "July 2026"
readTime: "6 min"
tags: [".NET", "Reflection", "Legacy Systems"]
---

We have a Windows desktop app at the office that prints invoices. It's licensed per seat, it's slow to install, and the one time someone just needs a single invoice as a PDF (to email it, to attach it to a case file, to check a number), spinning up a full workstation install of that app is absurd. So I built a standalone tool that renders one invoice to a PDF file from an order number, on a machine that has never had the real app installed.

The trick isn't parsing the invoice format myself. It's making the vendor's own engine do the rendering, on a machine it was never installed on.

## Borrowing the vendor's own renderer

The invoicing app doesn't format PDFs itself. It hands off to a closed-source .NET engine, a DLL that interprets proprietary invoice "model" files (little domain-specific programs, not documents) and lays out a page from them, pulling field data out of a database as it goes. The installed app calls this engine at print time and at PDF-attachment time, so it already produces byte-identical output through two different code paths. If I could load that same DLL and call the same API, I wouldn't need to install the app. I'd only need the engine assembly, its native PDF-rasterizer dependency, a folder of fonts and a logo bitmap, and the handful of `.mdl` model files that describe an invoice.

So the "installer" for my tool is really just a folder: the engine DLL, its native companion DLLs, four or five font files, one bitmap, and a chain of model files (a top-level invoice model that dispatches to one of two per-customer variants, which in turn call a couple of shared sub-models). Drop that folder next to a small driver exe and you have something you can copy to any machine, no vendor installer involved.

## The JIT compiles before your resolver runs

The interesting bug showed up immediately. The driver's `Main` method needs to register an `AssemblyResolve` handler before .NET goes looking for the engine DLL, because the DLL isn't sitting next to the exe in the usual probing path, it's off in a folder the tool has to point to at runtime. That should be simple: register the handler first thing in `Main`, then call the code that uses the engine types.

Except the CLR doesn't wait for you to run that code. It JIT-compiles a method the first time it's *entered*, and to JIT-compile a method, it has to resolve every type that method references, including ones several statements down. If `Main` itself references any engine type anywhere in its body, the JIT tries to resolve that type while compiling `Main`, before a single line of `Main` has executed, which means before the `AssemblyResolve` handler exists. The load fails before your fix even runs.

The fix is to keep `Main` free of any reference to the engine's types and move all of that into a separate method, marked to prevent the compiler from inlining it back into `Main`:

```csharp
private static int Main(string[] args)
{
    AppDomain.CurrentDomain.AssemblyResolve += ResolveFromEngineDir;
    SetDllDirectory(engineDir);
    return Run(args);
}

[MethodImpl(MethodImplOptions.NoInlining)]
private static int Run(string[] args)
{
    // only this method's JIT compilation touches the vendor's types,
    // and by the time it runs, the resolver above is already registered
    var model = new RenderModel(InvoiceModelName, RenderModel.ModelSource.Photocopy, ...);
    ...
}
```

`SetDllDirectory` handles the other half: the PDF engine has its own native (unmanaged) DLL, which the loader looks for by a completely different search path than managed assemblies use. Without that call, the managed assembly loads fine and then throws the moment it tries to touch its native half.

## A dependency probe that costs nothing

Because this tool runs on machines nobody has vetted, I built a `--check` mode that verifies every assumption without touching the database: the right .NET Framework release is installed (checked against the registry `Release` value, 378675 or higher, which corresponds to 4.5.1), the engine DLL and its two dependencies actually load as assemblies, the model files and images exist where expected, and the barcode font used on the letterhead is registered as a system font. Each check prints `OK`, `FAIL`, or `WARN` and the whole thing runs in well under a second with zero network calls. A setup script runs this after installing that barcode font (which does need to be present as a real Windows font, not just a file on disk) and again after a live test render, so a new machine gets a pass/fail answer before anyone tries it on a real order.

## What shipped

The whole driver is 245 lines of C#, compiled 32-bit because the engine DLL is 32-bit, producing an 11 KB exe. Everything else in the deployable folder is vendor assets: fonts, one bitmap, a handful of `.mdl` files, and two DLLs that do all the actual PDF work. The tool itself doesn't format a single line of the invoice. It just gets out of the way of the code that already knows how, on a machine that was never supposed to be able to run it.
