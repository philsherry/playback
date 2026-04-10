import { defineConfig } from 'tsup';

export default defineConfig({
	clean: true,
	dts: true,
	entry: {
		cli: 'src/cli.ts',
		config: 'src/config.ts'
	},
	format: ['esm'],
	target: 'node22'
});
