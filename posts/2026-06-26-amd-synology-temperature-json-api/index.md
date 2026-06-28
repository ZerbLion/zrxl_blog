---
title: "One Clean Temperature API for an AMD Synology NAS — CPU, Board, Every Disk, Cross-Checked"
date: 2026-06-26
summary: Getting temps off an AMD Synology is a maze — Glances can't see the board, the bundled smartctl is broken, AMD reports as Tctl not Core 0. So I pick the right source per value, merge them into one tiny JSON, and cross-check every reading against an independent source.
wechat_url:
tags: [self-hosting, NAS, homelab, monitoring, docker]
lang: en
translations: [zh]
---

<!-- English is the default version. 中文原文见 index.zh.md（站内点「中文」按钮切换）。 -->

# One Clean Temperature API for an AMD Synology NAS — CPU, Board, Every Disk, Cross-Checked

## Intro

I wanted one small, boring thing: to see my NAS's temperatures — CPU, board, every disk — on a little dial on my desk. On an AMD-based Synology, that turned into a surprisingly deep maze. No single tool would give me all the numbers, and the ones that gave me *some* numbers couldn't agree on them.

So I built the smallest thing that gets all the temperatures, off the right source for each value, merges them into one tiny JSON endpoint — and then doesn't trust itself, cross-checking every reading against an independent source on every run.

This is the story of why it's hard, and what "verified, not vibes" monitoring actually looks like.

---

## 1. Why temperatures are hard on an AMD Synology

Every "read your NAS temps" tutorial assumes an Intel box and one cooperative tool. On an AMD DSM machine, three things break that assumption at once:

- **The bundled `smartctl` is old and crippled.** It has no `--json`, its `--scan` is broken, and you only get the ATA SMART attribute table if you force the device type with `-d sat`. Miss that and your disks look temperature-less.
- **AMD doesn't report "Core 0".** Under the `k10temp` driver the CPU shows up as `Tctl` / `Tdie`, not the `Core 0` / `Package id 0` every Intel guide tells you to grep for.
- **Glances sees the CPU but not the board.** Running Glances in Docker gets you CPU sensors, but on these machines it simply doesn't surface a motherboard/system temperature, and its disk path is flaky inside the Synology container.

Each tool is missing a different piece. That's the whole reason this project exists: no one source is complete, so you have to assemble one.

## 2. The approach: the right source per value, merged into one JSON

Instead of forcing one tool to do everything, each value comes from whatever reports it most reliably:

| Value | Source | How |
| --- | --- | --- |
| CPU | Glances REST API | `…/api/4/sensors`, label `Tctl` (fallback `Tdie`) |
| System / board | Synology's own `synowebapi` | `SYNO.Core.System` → `sys_temp` (the value DSM itself shows) |
| Disks | `smartctl` | `-A -d sat /dev/sataN`, attribute `194` (or `190`) |

A small Python collector queries all three, normalizes them to integer Celsius, and writes a single flat JSON. If a source is unavailable, its field is `null` rather than a fabricated number. No database, no agent — just shell + Python 3 and two tiny containers.

## 3. Don't trust your own pipeline — grade it every run

Here's the part I'm proudest of. Most homelab monitoring is *self-consistent*: it reports whatever its one tool said, and you hope it's right. This one **checks itself against three independent sources on every run**, via a `verify.py`:

- **CPU** — endpoint (Glances) vs. reading `/sys/class/hwmon/hwmon0/temp1_input` directly from sysfs (`k10temp`, bypassing Glances entirely).
- **System** — endpoint vs. `synowebapi`'s `sys_temp` (the official DSM value).
- **Disks** — endpoint (smartctl) vs. DSM's Storage Manager (`SYNO.Storage.CGI.Storage`).

It allows a `3°C` tolerance to absorb the ~30-second gap between samples, prints a PASS/FAIL table, and exits non-zero if anything disagrees. The point isn't that cross-checking is fancy — it's that a temperature you haven't verified against a second source is just a number that *looks* official.

## 4. The contract: one flat JSON → a physical dial

Everything downstream depends on one stable shape:

```json
{ "ts": 1750900000, "unit": "C", "model": "DS1525+",
  "cpu": 53, "cpu_label": "Tctl", "system": 41,
  "disks": [ { "name": "sata1", "temp": 38 } ] }
```

A daemon refreshes it every 30 seconds and writes it **atomically** — temp file, then `mv` — so a reader never catches a half-written file. An `nginx:alpine` container serves it read-only on `:8787`. From there:

- An **ESP32 / M5Dial** desk gadget does an HTTP GET and parses it with ArduinoJson v7, using the `ts` field to decide if the data is stale.
- A self-contained `web/index.html` renders the same JSON as a live dial in the browser: green below 66°C, amber 66–81°C, red above — refreshing every 5 seconds, with a stale-data dot if `ts` is older than 90s.

## 5. The war stories

A few pits worth their own paragraph, because they cost real time:

- **The script that kills itself.** Synology ships busybox, which has no `pgrep`. `pkill -f temps_daemon.sh` matches the *launcher's own* command line (it contains that path) and kills the very thing managing the daemon. The fix: track a PID file and `kill` by PID, never by pattern.
- **Empty CPU sensors in Docker.** Glances in a container returns no sensors until you give it the host PID namespace (`pid: host` in compose) — otherwise psutil can't see the host's hardware.
- **`scp` that won't connect.** Deploying to DSM failed with `subsystem request failed on channel 0` because Synology doesn't enable the SFTP subsystem modern `scp` defaults to. `scp -O` (legacy protocol) fixes it.

## 6. Honest trade-offs

This is a sharp little tool, not an enterprise stack — be clear about the edges:

- **It's tuned to one machine.** Disk slots, the AMD `Tctl` label, the `hwmon0` path, and several volume paths are currently hardcoded. Different model, disk count, or an Intel box means editing code (factoring these into config is on the TODO).
- **Temperatures only, for now.** Throughput, load, fan RPM, volume capacity, UPS — all roadmap, none shipped yet.
- **The physical M5Dial firmware is still a vision.** Today the "dial" is a browser page plus a mockup; the on-device firmware isn't written.
- **No auth, internal only.** The endpoint binds on the LAN with no authentication — never port-forward it, never tunnel it to the public internet. Anyone on your network can read these numbers.

None of that dents the core win: on a platform where temperatures are scattered across three half-working tools, this gives you one endpoint you can actually trust.

→ **[github.com/ZerbLion/nas_monitoring](https://github.com/ZerbLion/nas_monitoring)**

If it saved you an afternoon of fighting `smartctl`, a ⭐ means a lot.
