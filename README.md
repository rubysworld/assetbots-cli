# Assetbots CLI

A command-line interface for the [Assetbots](https://assetbots.com) asset management API.

## Setup

1. Get an API key from Assetbots (Settings → API in the web app)
2. Set the environment variable:
   ```bash
   export ASSETBOTS_API_KEY="your-api-key"
   ```

## Usage

```bash
npx tsx /Users/ruby/Projects/assetbots-cli/assetbots.ts <command> [options]
```

### Commands

#### Assets
```bash
# List all assets
assetbots assets
assetbots assets --limit 50 --offset 0
assetbots assets --filter "category eq Computers"

# Get a specific asset by ID or tag
assetbots asset <id-or-tag>

# Search assets
assetbots search <query>
```

#### People
```bash
# List all people
assetbots people
assetbots people --filter "department eq IT"

# Get a specific person
assetbots person <id>
assetbots person <id> --assets  # Include assigned assets
```

#### Locations
```bash
# List all locations
assetbots locations

# Get a specific location
assetbots location <id>
assetbots location <id> --assets  # Include assets at location
```

#### Checkouts & Check-ins
```bash
# Checkout assets to a person
assetbots checkout --assets <asset-id-1> <asset-id-2> --person <person-id>

# Checkout assets to a location
assetbots checkout --assets <asset-id> --location <location-id>

# Check in assets
assetbots checkin --assets <asset-id-1> <asset-id-2>
```

#### Repairs
```bash
# List repairs
assetbots repairs

# Create a repair
assetbots repair <asset-id> --description "Screen cracked"
```

#### Notes
```bash
# List notes
assetbots notes

# Add a note to an asset
assetbots note <asset-id> --text "Cleaned and tested"
```

#### Other
```bash
# List databases
assetbots databases
```

### Options

All commands support:
- `--json` - Output raw JSON response
- `--help` - Show command help

List commands support:
- `-l, --limit <number>` - Max results (default: 100)
- `-o, --offset <number>` - Starting offset (default: 0)
- `-f, --filter <filter>` - OData filter expression

### Filtering

The API supports OData-like filtering:

```bash
# Filter by exact match
assetbots assets --filter "tag eq ABC123"

# Filter by category
assetbots assets --filter "category eq Laptops"

# Combine filters
assetbots assets --filter "brand eq Apple and category eq Laptops"
```

Supported operators:
- `eq` - Equal
- `gt` - Greater than
- `ge` - Greater than or equal
- `lt` - Less than
- `le` - Less than or equal  
- `nq` - Not equal
- `and`, `or` - Logical operators

## API Reference

Full API documentation: https://api.assetbots.com

## License

MIT
