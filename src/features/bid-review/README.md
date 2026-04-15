# Bid Review — Connection Fields (2380 / 2381)

## Overview

Two connection fields link bid line items to each other:

| Field | Key | Label | Direction |
|-------|-----|-------|-----------|
| `field_2380` | `bidConnDevice` | **Connected Devices** | Points from a headend/NVR item → cameras/readers it serves |
| `field_2381` | `bidConnTo` | **Connected To** | Points from a camera/reader → the headend/NVR it connects to |

These fields are **reciprocal**: if Record A's Connected Devices includes Record B, then Record B's Connected To must include Record A (and vice versa).

## Filtering rules

### Connected Devices (field_2380)

Options shown: bid items where:
- `proposalBucket` = "Camera or Reader" **AND** `field_2381` (Connected To) is currently blank
- OR the item is already selected in the current record's 2380

This prevents a camera/reader from being claimed by multiple headend items.

### Connected To (field_2381)

Options shown: bid items where:
- `field_2374` (`bidMapConn` / "Map Connections") = **Yes**
- OR the item is already selected in the current record's 2381

`field_2374` is a flag that indicates a record participates in connection mapping (typically headend/NVR items).

## Reciprocal change requests

When a change request modifies either connection field, the system automatically creates **reciprocal change requests** on the affected records:

### Adding a connection

> User edits **NVR-01** and selects **Camera-05** in Connected Devices (2380).

The system auto-creates a change request on **Camera-05** that sets its Connected To (2381) to include **NVR-01**.

### Removing a connection

> User edits **NVR-01** and un-checks **Camera-05** from Connected Devices (2380).

The system auto-creates a change request on **Camera-05** that removes **NVR-01** from its Connected To (2381).

### Bidirectional

The same logic applies in reverse. If a user edits Camera-05's Connected To (2381) to add or remove NVR-01, a reciprocal change request is created on NVR-01's Connected Devices (2380).

### Merge behavior

Reciprocal changes are **merged** into any existing pending change request for the affected record. If Camera-05 already has a pending rate change, the reciprocal only adds/updates the connection field without overwriting the rate change.
