# sf-bulker

A CLI tool for importing CSV data into Salesforce using the Bulk API v2.

Built with native Node.js ESM modules — no Salesforce SDK required.

## Prerequisites

- Node.js 18+
- A Salesforce connected app with OAuth 2.0 client credentials flow enabled

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

3. Copy `config/config.json.example` to `config/config.json` and configure your import entries (see [Configuration](#configuration)).

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

## Project structure

```
index.js              # Entry point
src/
  sf-bulk.js          # Salesforce Bulk API v2 client (native https)
  sf-oauth.js         # Salesforce OAuth2 client credentials flow
config/
  config.json         # Import entries (gitignored, see config.json.example)
  config.json.example # Example configuration
  functions.js        # Custom row transform functions
source/               # Input CSV files
output/               # Result CSVs written after each job
```

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
| `rowTransform` | no | Name of a function exported from `config/functions.js` to apply to each row after mapping |

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
    "skipFields": ["AccountSource"],
    "rowTransform": "remapAccount"
  }
]
```

When `mapping`, `skipFields`, or `rowTransform` are defined, a remapped file is generated at `source/<filename>_remapped.<ext>` before the upload. Embedded `\r` characters in field values are automatically stripped to prevent Salesforce Bulk API line ending errors.

### Row transform functions

Define custom per-row logic in `config/functions.js` and reference it by name via `rowTransform`. Each function receives the already-mapped row object and must return the (modified) row:

```js
export default {
  remapAccount: (row) => {
    row.Name += ' (imported)'
    return row
  }
}
```

## Example output

```
Processing: export_historique_products.csv | object: Product2 | operation: upsert
Source file: ./source/export_historique_products_remapped.csv | Operation: upsert | Object: Product2 | External ID: ExternalId__c
Target URL: https://your-instance.my.salesforce.com
Proceed? (y/yes to confirm): y
Job 750S900000RIYNAIA5 | State: UploadComplete | Processed: 0     | Failed: 0
Job 750S900000RIYNAIA5 | State: InProgress     | Processed: 4200  | Failed: 412
Job 750S900000RIYNAIA5 | State: InProgress     | Processed: 13298 | Failed: 1128
Job 750S900000RIYNAIA5 | State: InProgress     | Processed: 23298 | Failed: 1912
Job 750S900000RIYNAIA5 | State: InProgress     | Processed: 33498 | Failed: 2721
Job 750S900000RIYNAIA5 | State: InProgress     | Processed: 43698 | Failed: 3463
Job 750S900000RIYNAIA5 | State: InProgress     | Processed: 50698 | Failed: 3999
Job 750S900000RIYNAIA5 | State: InProgress     | Processed: 51098 | Failed: 4031
Job 750S900000RIYNAIA5 | State: JobComplete    | Processed: 51098 | Failed: 4031
Results saved to output/products_2026-04-02T15-46-35.csv
```
