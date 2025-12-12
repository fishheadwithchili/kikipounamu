import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
        // Prevent vitest from trying to process backend files if they are accidentally included
        exclude: ['**/node_modules/**', '**/dist/**', '**/.{idea,git,cache,output,temp}/**'],
    },
});
