---
title: "Approved, But Not Saved: The Device Registry That Couldn't Write Its Own File"
date: "October 2026"
readTime: "8 min"
tags: ["C#", "Windows", "Error Handling"]
---

At the office I wrote an Android app for the field staff, and a small ASP.NET proxy that sits between the phones and the vendor's API. The proxy only talks to phones it knows. Every request carries a device token, and the token has to be a key in `devices.json`, a flat file of token to label. Delete a line and that phone is revoked.

On a Tuesday morning I approved my own phone, the lock screen lifted, I signed in, and the app went back to "Waiting for approval from the office". A second approval email was already in my inbox.

## How a phone gets in

The first design derived each token from the MDM's device id: `HMAC-SHA256(secret, udid)`, synced from the MDM's device list every five minutes. It could never work from inside the app. The MDM's udid is its agent's Android ID, and Android 8 and later scope that ID per app signing key, so my app can't present the same identifier the MDM sees. The only way to hand a phone its derived token was the MDM's broadcast message, which caps at 200 characters and doesn't make links tappable.

The day before, I had replaced it with email approval. A phone with no token posts a request, the proxy emails me a signed link, and the page behind it has Approve and Deny buttons. The decision is a POST so a mail scanner's GET can't approve anything. Approving mints a random token into `devices.json`, and the phone, which has been polling, collects it.

That was the first time the service ever wrote `devices.json`. Until then I had edited it by hand and the service only read it.

## The symptom

It looked like a sign-in bug, because the kick came right after signing in. It wasn't. I ran the whole flow with curl: request, approve, collect the token, call an endpoint.

```
<h1>Approved</h1>
token len 64
--- calendars:
{"error":"unknown device"} [401]
--- signin bogus creds:
{"error":"unknown device"} [401]
--- calendars again:
{"error":"unknown device"} [401]
```

A token the proxy had issued seconds earlier was unknown to the same proxy. The app did what I'd told it to do with that answer in a build from earlier that morning: on a 401 with `unknown device` it forgets its token and goes back behind the lock, where it asks to be approved again.

Here's the write path as it shipped:

```csharp
private void Mutate(Action<Dictionary<string, string>> change)
{
    lock (_lock)
    {
        try
        {
            var parsed = File.Exists(file)
                ? JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(file)) ?? new()
                : new();
            change(parsed);
            File.WriteAllText(file, JsonSerializer.Serialize(parsed, new JsonSerializerOptions { WriteIndented = true }));
            // Next lookup reloads; the write time alone might not move on
            // a coarse filesystem clock.
            _loadedWriteTime = DateTime.MinValue;
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Could not update {File}", file);
        }
    }
}
```

The in-memory set is only ever what the last read of the file produced. If `WriteAllText` throws, the catch logs the error and returns. `Add` returned void, so the approve handler had nothing to check. It marked the request approved and rendered "Approved. The phone connects within a few seconds. Nothing else to do."

The read side of the same class has this comment:

```csharp
// Fail CLOSED. Deleting or botching this file is the
// emergency revocation path - keeping a stale list here
// would silently un-revoke whatever the operator just tried
// to revoke. Locking everyone out is visible; that is the
// point.
_devices = new();
```

A failed read locks every phone out, which is hard to miss. A failed write got one log line and a page that said Approved.

## Two wrong guesses

I couldn't see the server's filesystem from my desk, so I guessed.

The first guess was a race. `WriteAllText` isn't atomic, the first signed-in request triggers a second rewrite to tag the label with the employee code, and a concurrent request could read a half-written file, fail closed and empty the set for one request. One 401 is all the app needed to drop its token. That is a real hole and I fixed it. Proxy 1.7.2 applies the change to the in-memory set before touching the disk, writes to `devices.json.tmp` and swaps it in with `File.Move(tmp, file, overwrite: true)`, retries a busy read five times 40 ms apart, and keeps the last good set when the file exists but can't be read right now. The smoke suite passed, 88 assertions.

Then 1.7.2 went live, the service restarted, and the token I had approved with curl was still unknown. It had never reached the disk, so this wasn't a race.

The second guess was a truncated file: one bad rewrite, and every read since failing closed. I didn't wait to find out. I ran a one-liner in an elevated PowerShell on the server that overwrote `devices.json` with only the `_comment` line, emptied the pending requests and restarted the service.

## Making the approve page report it

By then an audit of the enrollment code had come back with the swallowed write as its first finding. Proxy 1.7.3 made `Mutate` return whether the change reached disk and gave the approve page a new outcome:

```csharp
Enrollment.Outcome.ApprovedNotPersisted => EnrollPages.Html("Approved, but not saved",
    "The phone connects now, but the proxy could not write devices.json - the approval is lost at the next service restart. " +
    ...
```

It answers with a 500. I reinstalled the app, got the email, pressed Approve, and read "Approved, but not saved" on my own page. Sign-in worked, because the token was live in memory.

I had two candidates left. Access denied meant a one-line `icacls`. A sharing violation meant the antivirus was holding the freshly written file and the swap needed a retry. The diagnostic printed the registry's last errors from the event log, the file's ACL, the account the service runs as, and a listing of `devices.json*`.

The service runs as `NT AUTHORITY\NetworkService`. The ACL on `devices.json` granted Users read. Next to it sat a 224-byte `devices.json.tmp`, which was my approval. The service could create a new file in that folder and could not replace the one I had made.

My own setup notes for the server had this as step 5:

```
# 5. Give the service account write access to logs\ ONLY (it inherits read on
#    the rest; granting Modify on the whole dir would let a compromised
#    process rewrite its own exe/config/allowlist). Skipping this silently
#    loses the audit log.
```

Step 3 was "Create devices.json". I created it, as an admin, and then shipped a feature that needed the service to rewrite it.

## The stopgap, then the fix

The stopgap was a Modify grant on the file and on the whole install folder, which is what step 5 says not to do. Proxy 1.7.4 moved the file into `enroll-state\`, the folder the service already creates for pending requests. A `devices.json` left next to the exe is copied in once at startup and then ignored. The install folder went back to read-only for the service account, and the grant is on two folders:

```powershell
icacls <install dir>\logs /grant "NT AUTHORITY\NetworkService:(OI)(CI)M"
icacls <install dir>\enroll-state /grant "NT AUTHORITY\NetworkService:(OI)(CI)M"
```

It goes on the folder so that a file anyone recreates later inherits it. When 1.7.4 came up, the migrated `devices.json` was 103 bytes: the reset file, still with no phone in it. I approved the phone one more time and it worked.

The app got its half too. In 0.14.2 a single `unknown device` no longer un-enrolls the phone:

```kotlin
private fun confirmUnknownDevice(): Boolean {
    val token = DeviceEnrollment.token() ?: return false
    Thread.sleep(750)
    return try {
        val conn = open("GET", "/calendars", bearer = null)
        try {
            if (conn.responseCode != 401) return false
            val text = conn.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
            text.contains("unknown device") && DeviceEnrollment.token() == token
        } finally {
            conn.disconnect()
        }
    } catch (e: Exception) {
        false
    }
}
```

It waits 750 ms and asks again on the cheapest route. Only a second refusal drops the token.

## What it cost

Four proxy releases, 1.7.1 through 1.7.4, committed between 08:55 and 09:30, each one waiting on a server that pulls new releases every ten minutes. 1.7.1 was for a different bug that morning. 1.7.2 hardened a path that wasn't the cause. 1.7.3 put the failure on the page, and 1.7.4 fixed it.

The fail-closed comment is still in the code, above the same `_devices = new()`. `Add` returns a bool now. The smoke suite went from 88 assertions to 93, and none of the five new ones makes the devices file unwritable and checks what the page says.
