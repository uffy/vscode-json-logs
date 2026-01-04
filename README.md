# JSON Log Viewer

A VS Code extension to preview JSON formatted log files with filtering and search capabilities.

## Features

- **Formatted Log Display**: View logs in a clean, readable format with syntax highlighting
- **Level Filtering**: Filter logs by level (DEBUG, INFO, WARN, ERROR)
- **Search**: Search through log content
- **Fields Detail Modal**: Click on fields to view detailed information with VIEWER/RAW modes

## Usage

1. Open a `.log` file containing JSON formatted logs
2. Click the preview button in the editor title bar, or run `JSON Logs: Preview` from the command palette

## Log Format

The extension expects each line to be a JSON object with the following structure:

```json
{
  "time": "2025-11-14 19:29:25.491",
  "level": "INFO",
  "name": "ModuleName",
  "message": "Log message here",
  "fields": {
    "key": "value"
  },
  "caller": "path/to/file.go:123"
}
```

## Development

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Watch mode
npm run watch
```

Press `F5` in VS Code to launch the extension in debug mode.

## License

MIT

