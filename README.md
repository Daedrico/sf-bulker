# sf-bulker

A CLI tool for importing CSV data into Salesforce using the Bulk API v2.

## Prerequisites

- Node.js 18+
- A Salesforce connected app with OAuth client credentials

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file at the root:
   ```env
   CLIENT_ID=your_connected_app_client_id
   CLIENT_SECRET=your_connected_app_client_secret
   URL=https://your-instance.my.salesforce.com
   ```

3. Copy `config.json.example` to `config.json` and configure your import entries (see [Configuration](#configuration)).

4. Place your CSV source files in the `source/` directory.

## Usage

```bash
npm run import -- <name>
```

Where `<name>` matches the `name` field of an entry in `config.json`.

**Example:**
```bash
npm run import -- account-upsert
```

Results are written to the `output/` directory as two timestamped files:
- `<name>_success_<timestamp>.csv`
- `<name>_failed_<timestamp>.csv`

## Configuration

`config.json` is an array of import entries. Each entry supports the following fields:

| Field | Required | Description |
|---|---|---|
| `name` | yes | Unique identifier used on the CLI |
| `filename` | yes | Source CSV filename inside `source/` |
| `object` | yes | Salesforce object API name (e.g. `Account`) |
| `operation` | yes | Bulk API operation: `insert`, `update`, `upsert`, `delete` |
| `externalIdField` | upsert only | API name of the external ID field |
| `mapping` | no | Object mapping source column names to target field names |
| `skipFields` | no | Array of source column names to exclude from the upload |

**Example:**
```json
[
  {
    "name": "account-upsert",
    "filename": "account.csv",
    "object": "Account",
    "externalIdField": "ExternalId__c",
    "operation": "upsert",
    "mapping": {
      "RecordType.Name": "RecordType.Name"
    },
    "skipFields": ["AccountSource"]
  }
]
```

When `mapping` or `skipFields` are defined, a remapped file is generated at `source/<filename>_remapped.<ext>` before the upload. Embedded `\r` characters in field values are automatically stripped to prevent Salesforce Bulk API line ending errors.
