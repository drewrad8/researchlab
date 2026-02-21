# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please email the maintainer directly. You should receive a response within 72 hours.

When reporting, please include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Security Model

Research Lab is designed for **local use**. It is not intended to be exposed to the public internet.

Key security considerations:

- Server binds to `0.0.0.0` by default -- bind to `127.0.0.1` if running on a shared machine
- No authentication layer -- all API endpoints are open
- No telemetry or external data collection
- Research data is stored locally in `~/.researchlab/`
- Worker tasks are delegated to Strategos, which has its own security model

## Disclosure Policy

When a vulnerability is confirmed, we will:

1. Confirm the problem and determine affected versions
2. Prepare a fix
3. Release a patched version
4. Publish a security advisory if appropriate
