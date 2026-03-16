# KILN CLI

Command-line tooling for deploying and testing KILN agents from local YAML configs.

## Install

```bash
cd packages/kiln-cli
npm install
npm run build
```

Run locally with:

```bash
node dist/index.js --help
```

## Usage

Store your API key:

```bash
node dist/index.js login
```

Deploy an agent from YAML:

```bash
node dist/index.js deploy ./examples/support-agent.yml
```

List agents:

```bash
node dist/index.js list
```

View recent logs:

```bash
node dist/index.js logs <agentId> --limit 5
```

Send a test message:

```bash
node dist/index.js test <agentId> "What are your support hours?"
```

You can override credentials per command with `--api-key` and `--base-url`.
