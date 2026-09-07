/**
 * Jest global setup — loads test environment variables.
 * Create a .env.test file in the project root with a test database URL.
 */
import 'dotenv/config';

// Override NODE_ENV for tests
process.env['NODE_ENV'] = 'test';
