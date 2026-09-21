---
title: Install
description: Rebase an existing Fedora Atomic system onto a Cloche image.
sidebar:
  order: 2
---

Prefer an installer ISO? See [Download](/download/) and [Build an ISO](/docs/build-iso/).

## rpm-ostree images

To migrate an existing Fedora Atomic workstation, pick a variant and rebase:

```bash
# GNOME
rpm-ostree rebase ostree-unverified-registry:ghcr.io/cloche-project/cloche-standard-gnome:latest

# Plasma
rpm-ostree rebase ostree-unverified-registry:ghcr.io/cloche-project/cloche-standard-plasma:latest
```

Then reboot to apply the new layers:

```bash
systemctl reboot
```

## bootc images

The PRO line is bootable through bootc. Its installation documentation will be added here.

## Cloche Xe

Cloche Xe images use the same rpm-ostree rebase, with the Xe image names:

```bash
# Desktop
rpm-ostree rebase ostree-unverified-registry:ghcr.io/cloche-project/cloche-xe:latest

# GNOME
rpm-ostree rebase ostree-unverified-registry:ghcr.io/cloche-project/cloche-xe-gnome:latest

# Steam Deck
rpm-ostree rebase ostree-unverified-registry:ghcr.io/cloche-project/cloche-xe-deck:latest

# Steam Deck with GNOME
rpm-ostree rebase ostree-unverified-registry:ghcr.io/cloche-project/cloche-xe-deck-gnome:latest
```

Reboot afterwards, as above.

## Verify the signature

Each repository ships a `cosign.pub` at its root. Verify an image with:

```bash
cosign verify --key cosign.pub ghcr.io/cloche-project/cloche-standard-gnome:latest
```
