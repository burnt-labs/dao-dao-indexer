# Contributing to Argus

Thank you for your interest in contributing to Argus! This document provides guidelines and information for contributors.

## How to Contribute

### Reporting Issues

- Check if the issue already exists in the [GitHub Issues](https://github.com/burnt-labs/dao-dao-indexer/issues)
- If not, create a new issue with a clear title and description
- Include steps to reproduce, expected behavior, and actual behavior
- Add relevant labels and screenshots if applicable

### Pull Requests

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes
4. Add tests if applicable
5. Ensure all tests pass
6. Update documentation if needed
7. Commit with a clear message
8. Push to your fork
9. Create a Pull Request

### Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/burnt-labs/dao-dao-indexer.git
   cd dao-dao-indexer
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up the database and configuration (see README.md for details)

4. Run tests:
   ```bash
   npm test
   ```

### Code Style

- Use TypeScript for new code
- Follow existing code patterns
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep lines under 80 characters when possible

### Testing

- Write unit tests for new features
- Ensure all existing tests pass
- Test edge cases and error conditions
- Use descriptive test names

### Commit Messages

- Use clear, descriptive commit messages
- Start with a verb (e.g., "Add", "Fix", "Update")
- Reference issue numbers when applicable (e.g., "Fix #123")

### Documentation

- Update README.md for significant changes
- Add JSDoc comments for new functions
- Update API documentation if endpoints change

## Code of Conduct

Please be respectful and inclusive in all interactions. We follow a code of conduct to ensure a positive community.

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (AGPL-3.0).