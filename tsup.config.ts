import { defineConfig } from 'tsup';

export default defineConfig({
	entry: {
		cli: 'src/cli.ts',
		config: 'src/config.ts',
	},
	format: ['esm'],
	dts: true,
	clean: true,
	target: 'node22',
});
