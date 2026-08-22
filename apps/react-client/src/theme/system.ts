import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

const interviewTheme = defineConfig({
	globalCss: {
		"*::selection": {
			bg: "accent",
			color: "forest",
		},
		body: {
			bg: "canvas",
			color: "ink",
			fontFamily: "body",
		},
	},
	theme: {
		tokens: {
			colors: {
				accent: { value: "#C8FF74" },
				canvas: { value: "#F4F5F7" },
				cobalt: { value: "#4657E8" },
				danger: { value: "#C13F46" },
				forest: { value: "#172522" },
				ink: { value: "#17201D" },
				line: { value: "#DDE1E0" },
				muted: { value: "#687470" },
				paper: { value: "#FAFAF8" },
				softAccent: { value: "#ECF0FF" },
				softDanger: { value: "#FCEBEC" },
				softWarning: { value: "#FFF5D9" },
				success: { value: "#277A58" },
				surface: { value: "#FFFFFF" },
				warningText: { value: "#72520A" },
			},
			fonts: {
				body: {
					value:
						'"Instrument Sans Variable", "Instrument Sans", system-ui, sans-serif',
				},
				display: {
					value:
						'"Bricolage Grotesque Variable", "Bricolage Grotesque", sans-serif',
				},
				mono: {
					value: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
				},
			},
			radii: {
				"2xl": { value: "1.5rem" },
				"2xs": { value: "0.2rem" },
				"3xl": { value: "2rem" },
				"4xl": { value: "2.5rem" },
				full: { value: "9999px" },
				lg: { value: "0.85rem" },
				md: { value: "0.65rem" },
				none: { value: "0" },
				sm: { value: "0.45rem" },
				xl: { value: "1.1rem" },
				xs: { value: "0.3rem" },
			},
		},
	},
});

export const system = createSystem(defaultConfig, interviewTheme);
