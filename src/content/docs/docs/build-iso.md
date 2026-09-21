---
title: Build an ISO
description: Build a Cloche installer ISO locally with cloche-build, until official ISOs are published.
sidebar:
  order: 3
---

Official ISOs are not published yet (see [Download](/download/)). Until they are, you can build the same installer ISO yourself with `cloche-build`, a helper script in the [cloche-utils](https://github.com/Cloche-Project/cloche-utils) repository.

The ISO is an installer: it installs the matching pre-built image from `ghcr.io/cloche-project/...`, so the build itself does not compile the image from source.

## Requirements

Install these on the machine you build on. `cloche-build` checks for them and stops early with a clear message if something is missing.

- **bootc variants** (Cloche PRO): `podman`, `xorriso`, `cpio` and `gzip`. These variants run Podman privileged, with `sudo`.
- **rpm-ostree variants** (Cloche, Cloche Xe): `bluebuild`, `mkksiso` (the `lorax` package on Fedora: `sudo dnf install lorax`), `xorriso`, `cpio` and `gzip`.
- **Interactive menu** (optional): `whiptail`, the `newt` package on Fedora.

## Build

```bash
git clone https://github.com/Cloche-Project/cloche-utils
cd cloche-utils/cloche-build

./cloche-build --variant standard-gnome --mode attended
```

Run `./cloche-build` with no arguments to pick the variant and mode from a menu instead. The ISO is written to `output/` unless you pass `--output DIR`.

### Variants

| Family | `--variant` | ISO file |
|--------|-------------|----------|
| Cloche | `cloche` | `cloche.iso` |
| Cloche | `standard-gnome` | `cloche-standard-gnome.iso` |
| Cloche | `standard-plasma` | `cloche-standard-plasma.iso` |
| Cloche PRO | `cloche-pro` | `cloche-pro.iso` |
| Cloche PRO | `pro-workstation-gnome` | `cloche-pro-gnome.iso` |
| Cloche PRO | `pro-workstation-plasma` | `cloche-pro-plasma.iso` |
| Cloche Xe | `xe` | `cloche-xe.iso` |
| Cloche Xe | `xe-gnome` | `cloche-xe-gnome.iso` |
| Cloche Xe | `xe-deck` | `cloche-xe-deck.iso` |
| Cloche Xe | `xe-deck-gnome` | `cloche-xe-deck-gnome.iso` |

### Attended or unattended

`--mode` is required and picks how the installer behaves:

- **`attended`**: a graphical installer where you make the choices. The root account is locked, and first-boot setup runs on the first start.
- **`unattended`**: installs with no questions and reboots when done. It creates a `sysadmin` user in the `wheel` group with SSH enabled, and needs a password hash in the environment:

  ```bash
  export CLOCHE_BUILD_USER_PASSWORD_HASH="$(openssl passwd -6)"
  ./cloche-build --variant standard-gnome --mode unattended
  ```

:::caution[Unattended installs erase every disk]
The unattended installer wipes all disks on the machine it runs on, then partitions automatically. Only boot it on hardware you intend to erase completely.
:::

### Useful options

| Option | What it does |
|--------|--------------|
| `--image REF` | Install a different image than the variant's default (for example a fork or a specific tag). |
| `--output DIR` | Write the ISO somewhere other than `output/`. |
| `--dry-run` | Print what would run without building anything. |
| `--verify-boot` | After the build, boot the ISO headlessly in QEMU with OVMF, emulated as a USB stick, to confirm it actually starts. Needs `qemu-system-x86_64` and OVMF firmware, and takes a few minutes. |

Run `--verify-boot` before writing the ISO to a USB stick: it catches ISOs that look correct on disk but fail to boot.

## Without an ISO

If you already run a Fedora Atomic system, you can skip the ISO and [rebase to a Cloche image](/docs/install/).
