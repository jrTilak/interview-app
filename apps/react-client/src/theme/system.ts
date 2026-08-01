import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

const zeroRadii = {
	"2xl": { value: "0" },
	"2xs": { value: "0" },
	"3xl": { value: "0" },
	"4xl": { value: "0" },
	full: { value: "0" },
	lg: { value: "0" },
	md: { value: "0" },
	none: { value: "0" },
	sm: { value: "0" },
	xl: { value: "0" },
	xs: { value: "0" },
} as const;

const interviewTheme = defineConfig({
	globalCss: {
		"*": {
			borderRadius: "0 !important",
		},
		"*::selection": {
			bg: "accent",
			color: "forest",
		},
		body: {
			bg: "paper",
			color: "ink",
			fontFamily: "body",
		},
	},
	theme: {
		tokens: {
			colors: {
				accent: { value: "#D6FF4B" },
				cobalt: { value: "#2447F2" },
				danger: { value: "#B5322C" },
				forest: { value: "#142B26" },
				ink: { value: "#111815" },
				line: { value: "#C9CEC7" },
				muted: { value: "#68736D" },
				paper: { value: "#F4F2EC" },
				success: { value: "#247552" },
				surface: { value: "#FBFAF6" },
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
			radii: zeroRadii,
		},
	},
});

export const system = createSystem(defaultConfig, interviewTheme);
