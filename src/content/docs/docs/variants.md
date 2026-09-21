---
title: Choose an image
description: The Cloche image family and what each variant is for.
sidebar:
  order: 1
---

Cloche is a family of images. Each one is published to GHCR as `ghcr.io/cloche-project/<image>`.

| Image | Deployment | Description |
|-------|------------|-------------|
| `cloche` | rpm-ostree | Headless base image. Root of the tree. |
| `cloche-standard-gnome` | rpm-ostree | GNOME desktop on top of `cloche`. |
| `cloche-standard-plasma` | rpm-ostree | KDE Plasma desktop on top of `cloche`. |
| `cloche-pro` | bootc | Minimal bootc base on CentOS Stream, used by the PRO workstation images. |
| `cloche-pro-workstation-gnome` | bootc | PRO workstation with GNOME. |
| `cloche-pro-workstation-plasma` | bootc | PRO workstation with KDE Plasma. |
| `cloche-xe` and `cloche-xe-gnome` | rpm-ostree | Variants built on Bazzite. |
| `cloche-xe-deck` and `cloche-xe-deck-gnome` | rpm-ostree | Steam Deck variants built on Bazzite. |

:::note
The PRO line uses `bootc` over CentOS Stream while the rest uses `rpm-ostree` over Fedora. The difference is intentional.
:::

See [Install](/docs/install/) to move an existing system to one of these images, and [Image status](/status/) for the latest build results.
