import {
	createSystem,
	defaultConfig,
	defineConfig,
	defineRecipe,
	defineSlotRecipe,
} from "@chakra-ui/react";
import {
	alertAnatomy,
	cardAnatomy,
	dataListAnatomy,
	dialogAnatomy,
	emptyStateAnatomy,
	fieldAnatomy,
	nativeSelectAnatomy,
	segmentGroupAnatomy,
	statusAnatomy,
	switchAnatomy,
	tableAnatomy,
	toastAnatomy,
} from "@chakra-ui/react/anatomy";

const squareRadii = {
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

const buttonRecipe = defineRecipe({
	base: {
		_active: { transform: "translateY(1px)" },
		borderRadius: "none",
		colorPalette: "brand",
		fontWeight: "700",
		transitionDuration: "fast",
		transitionProperty:
			"background-color, border-color, color, box-shadow, transform",
	},
});

const headingRecipe = defineRecipe({
	base: {
		fontFamily: "display",
		fontWeight: "650",
		letterSpacing: "-0.025em",
	},
});

const linkRecipe = defineRecipe({
	base: {
		borderRadius: "none",
		colorPalette: "brand",
	},
});

const inputRecipe = defineRecipe({
	base: {
		"--focus-color": "colors.brand.focusRing",
		borderRadius: "none",
		colorPalette: "brand",
	},
	variants: {
		variant: {
			outline: {
				_hover: { borderColor: "border.emphasized" },
				bg: "bg.panel",
				borderColor: "border",
			},
		},
	},
});

const textareaRecipe = defineRecipe({
	base: {
		"--focus-color": "colors.brand.focusRing",
		borderRadius: "none",
		colorPalette: "brand",
		resize: "vertical",
	},
	variants: {
		variant: {
			outline: {
				_hover: { borderColor: "border.emphasized" },
				bg: "bg.panel",
				borderColor: "border",
				focusRingColor: "var(--focus-color)",
			},
		},
	},
});

const spinnerRecipe = defineRecipe({
	base: {
		// The spinner is the design system's sole rounded element.
		borderRadius: "9999px",
	},
});

const alertSlotRecipe = defineSlotRecipe({
	className: "chakra-alert",
	slots: alertAnatomy.keys(),
	base: {
		root: { borderRadius: "none" },
		title: { fontWeight: "700" },
	},
});

const cardSlotRecipe = defineSlotRecipe({
	className: "chakra-card",
	slots: cardAnatomy.keys(),
	base: {
		description: { color: "fg.muted" },
		root: { borderRadius: "none" },
		title: { fontFamily: "display", fontWeight: "650" },
	},
});

const dataListSlotRecipe = defineSlotRecipe({
	className: "chakra-data-list",
	slots: dataListAnatomy.keys(),
	base: {
		itemLabel: {
			color: "fg.muted",
			fontFamily: "mono",
			fontSize: "2xs",
			fontWeight: "700",
			letterSpacing: "0.06em",
			textTransform: "uppercase",
		},
		itemValue: { fontWeight: "700" },
	},
});

const dialogSlotRecipe = defineSlotRecipe({
	className: "chakra-dialog",
	slots: dialogAnatomy.keys(),
	base: {
		backdrop: { bg: "forest/72" },
		content: {
			borderColor: "border",
			borderRadius: "none",
			borderWidth: "1px",
		},
		title: { fontFamily: "display", fontWeight: "650" },
	},
});

const emptyStateSlotRecipe = defineSlotRecipe({
	className: "chakra-empty-state",
	slots: emptyStateAnatomy.keys(),
	base: {
		content: { textAlign: "center" },
		indicator: { color: "brand.fg" },
		root: {
			bg: "bg.panel",
			borderColor: "border",
			borderRadius: "none",
			borderWidth: "1px",
		},
		title: { fontFamily: "display", fontWeight: "650" },
	},
});

const fieldSlotRecipe = defineSlotRecipe({
	className: "chakra-field",
	slots: fieldAnatomy.keys(),
	base: {
		label: {
			color: "fg",
			fontFamily: "mono",
			fontSize: "xs",
			fontWeight: "700",
			letterSpacing: "0.08em",
			textTransform: "uppercase",
		},
	},
});

const nativeSelectSlotRecipe = defineSlotRecipe({
	className: "chakra-native-select",
	slots: nativeSelectAnatomy.keys(),
	base: {
		field: {
			"--focus-color": "colors.brand.focusRing",
			borderRadius: "none",
		},
	},
	variants: {
		variant: {
			outline: {
				field: {
					_hover: { borderColor: "border.emphasized" },
					bg: "bg.panel",
					borderColor: "border",
					focusRingColor: "var(--focus-color)",
				},
			},
		},
	},
});

const segmentGroupSlotRecipe = defineSlotRecipe({
	className: "chakra-segment-group",
	slots: segmentGroupAnatomy.keys(),
	base: {
		indicator: { bg: "paper" },
		item: {
			_checked: { color: "forest" },
			color: "paperAlpha.62",
			minW: "0",
		},
		root: { bg: "paperAlpha.8", minW: "0", p: "1" },
	},
	variants: {
		size: {
			sm: {
				item: { gap: "1.5", px: "2" },
			},
		},
	},
});

const statusSlotRecipe = defineSlotRecipe({
	className: "chakra-status",
	slots: statusAnatomy.keys(),
	base: {
		indicator: { borderRadius: "none" },
	},
});

const switchSlotRecipe = defineSlotRecipe({
	className: "chakra-switch",
	slots: switchAnatomy.keys(),
	base: {
		control: { borderRadius: "none", colorPalette: "brand" },
		thumb: { borderRadius: "none" },
	},
	variants: {
		variant: {
			solid: {
				control: {
					_checked: { bg: "brand.solid" },
					borderRadius: "none",
				},
			},
		},
	},
});

const tableSlotRecipe = defineSlotRecipe({
	className: "chakra-table",
	slots: tableAnatomy.keys(),
	base: {
		columnHeader: {
			color: "fg.muted",
			fontFamily: "mono",
			fontSize: "2xs",
			fontWeight: "700",
			letterSpacing: "0.06em",
			textTransform: "uppercase",
		},
	},
});

const toastSlotRecipe = defineSlotRecipe({
	className: "chakra-toast",
	slots: toastAnatomy.keys(),
	base: {
		actionTrigger: { borderRadius: "none" },
		closeTrigger: { borderRadius: "none" },
		root: {
			bg: "forest",
			borderColor: "border.inverted",
			borderLeftColor: "accent",
			borderLeftWidth: "3px",
			borderRadius: "none",
			borderWidth: "1px",
			color: "paper",
		},
		title: { fontWeight: "700" },
	},
});

const interviewTheme = defineConfig({
	globalCss: {
		"*::selection": {
			bg: "accent",
			color: "forest",
		},
		body: {
			bg: "bg",
			color: "fg",
			fontFamily: "body",
		},
	},
	theme: {
		animationStyles: {
			"enter-up": {
				value: {
					animationDuration: "180ms",
					animationFillMode: "both",
					animationName: "enter-up",
					animationTimingFunction: "ease-out",
				},
			},
			"status-pulse": {
				value: {
					animationDuration: "1.25s",
					animationIterationCount: "infinite",
					animationName: "status-pulse",
					animationTimingFunction: "ease-in-out",
				},
			},
		},
		keyframes: {
			"enter-up": {
				from: { opacity: 0, transform: "translateY(4px)" },
				to: { opacity: 1, transform: "translateY(0)" },
			},
			"status-pulse": {
				"0%, 100%": { opacity: 1 },
				"50%": { opacity: 0.35 },
			},
		},
		layerStyles: {
			panel: {
				value: {
					bg: "bg.panel",
					borderColor: "border",
					borderWidth: "1px",
				},
			},
			"panel-inverted": {
				value: {
					bg: "bg.inverted",
					color: "fg.inverted",
				},
			},
			"sidebar-navigation": {
				value: {
					_hover: { bg: "paperAlpha.8", color: "paper" },
					_focusVisible: {
						outlineColor: "accent",
						outlineOffset: "2px",
						outlineStyle: "solid",
						outlineWidth: "2px",
					},
					"&[aria-current=page]": { bg: "accent", color: "forest" },
					"&[aria-current=page]:hover": { bg: "accent", color: "forest" },
					alignItems: "center",
					bg: "transparent",
					color: "paperAlpha.82",
					display: "flex",
					fontSize: "sm",
					fontWeight: "650",
					gap: "3",
					mb: "1",
					px: "3",
					py: "2.5",
					textDecoration: "none",
					transitionDuration: "fast",
					transitionProperty: "background-color, color",
				},
			},
			"sidebar-utility": {
				value: {
					_hover: { color: "paper" },
					alignItems: "center",
					color: "paperAlpha.55",
					display: "flex",
					fontSize: "xs",
					gap: "2",
					mb: "5",
					px: "2",
					textDecoration: "none",
				},
			},
		},
		recipes: {
			button: buttonRecipe,
			heading: headingRecipe,
			input: inputRecipe,
			link: linkRecipe,
			spinner: spinnerRecipe,
			textarea: textareaRecipe,
		},
		semanticTokens: {
			colors: {
				bg: {
					DEFAULT: { value: "{colors.canvas}" },
					emphasized: { value: "{colors.line}" },
					error: { value: "{colors.softDanger}" },
					info: { value: "{colors.softAccent}" },
					inverted: { value: "{colors.forest}" },
					muted: { value: "{colors.softAccent}" },
					panel: { value: "{colors.surface}" },
					subtle: { value: "{colors.paper}" },
					success: { value: "{colors.softSuccess}" },
					warning: { value: "{colors.softWarning}" },
				},
				border: {
					DEFAULT: { value: "{colors.line}" },
					emphasized: { value: "{colors.cobalt}" },
					error: { value: "{colors.danger}" },
					info: { value: "{colors.cobalt}" },
					inverted: { value: "{colors.paperAlpha.25}" },
					muted: { value: "{colors.line}" },
					subtle: { value: "{colors.paper}" },
					success: { value: "{colors.success}" },
					warning: { value: "{colors.warning}" },
				},
				brand: {
					border: { value: "{colors.line}" },
					contrast: { value: "{colors.paper}" },
					emphasized: { value: "{colors.cobalt}" },
					fg: { value: "{colors.forest}" },
					focusRing: { value: "{colors.cobalt}" },
					muted: { value: "{colors.accent}" },
					solid: { value: "{colors.forest}" },
					subtle: { value: "{colors.softAccent}" },
				},
				fg: {
					DEFAULT: { value: "{colors.ink}" },
					error: { value: "{colors.danger}" },
					info: { value: "{colors.cobalt}" },
					inverted: { value: "{colors.paper}" },
					muted: { value: "{colors.muted}" },
					subtle: { value: "{colors.paperAlpha.62}" },
					success: { value: "{colors.success}" },
					warning: { value: "{colors.warningText}" },
				},
				green: {
					border: { value: "{colors.success}" },
					contrast: { value: "{colors.white}" },
					emphasized: { value: "{colors.success}" },
					fg: { value: "{colors.success}" },
					focusRing: { value: "{colors.success}" },
					muted: { value: "{colors.softSuccess}" },
					solid: { value: "{colors.success}" },
					subtle: { value: "{colors.softSuccess}" },
				},
				highlight: {
					border: { value: "{colors.accent}" },
					contrast: { value: "{colors.forest}" },
					emphasized: { value: "{colors.accent}" },
					fg: { value: "{colors.forest}" },
					focusRing: { value: "{colors.accent}" },
					muted: { value: "{colors.accent}" },
					solid: { value: "{colors.accent}" },
					subtle: { value: "{colors.accent}" },
				},
				inverse: {
					border: { value: "{colors.paperAlpha.25}" },
					contrast: { value: "{colors.forest}" },
					emphasized: { value: "{colors.paperAlpha.82}" },
					fg: { value: "{colors.paper}" },
					focusRing: { value: "{colors.accent}" },
					muted: { value: "{colors.paperAlpha.25}" },
					solid: { value: "{colors.paper}" },
					subtle: { value: "{colors.paperAlpha.8}" },
				},
				orange: {
					border: { value: "{colors.warning}" },
					contrast: { value: "{colors.forest}" },
					emphasized: { value: "{colors.warning}" },
					fg: { value: "{colors.warningText}" },
					focusRing: { value: "{colors.warning}" },
					muted: { value: "{colors.softWarning}" },
					solid: { value: "{colors.warning}" },
					subtle: { value: "{colors.softWarning}" },
				},
				red: {
					border: { value: "{colors.danger}" },
					contrast: { value: "{colors.white}" },
					emphasized: { value: "{colors.danger}" },
					fg: { value: "{colors.danger}" },
					focusRing: { value: "{colors.danger}" },
					muted: { value: "{colors.softDanger}" },
					solid: { value: "{colors.danger}" },
					subtle: { value: "{colors.softDanger}" },
				},
			},
		},
		slotRecipes: {
			alert: alertSlotRecipe,
			card: cardSlotRecipe,
			dataList: dataListSlotRecipe,
			dialog: dialogSlotRecipe,
			emptyState: emptyStateSlotRecipe,
			field: fieldSlotRecipe,
			nativeSelect: nativeSelectSlotRecipe,
			segmentGroup: segmentGroupSlotRecipe,
			status: statusSlotRecipe,
			switch: switchSlotRecipe,
			table: tableSlotRecipe,
			toast: toastSlotRecipe,
		},
		tokens: {
			colors: {
				accent: { value: "#C8FF74" },
				canvas: { value: "#F4F5F7" },
				cobalt: { value: "#4657E8" },
				danger: { value: "#C13F46" },
				dangerOnDark: { value: "#FFB7B2" },
				forest: { value: "#172522" },
				forestAlpha: {
					82: { value: "rgba(23, 37, 34, 0.82)" },
					85: { value: "rgba(23, 37, 34, 0.85)" },
				},
				ink: { value: "#17201D" },
				line: { value: "#DDE1E0" },
				muted: { value: "#687470" },
				paper: { value: "#FAFAF8" },
				paperAlpha: {
					8: { value: "rgba(250, 250, 248, 0.08)" },
					14: { value: "rgba(250, 250, 248, 0.14)" },
					25: { value: "rgba(250, 250, 248, 0.25)" },
					48: { value: "rgba(250, 250, 248, 0.48)" },
					55: { value: "rgba(250, 250, 248, 0.55)" },
					62: { value: "rgba(250, 250, 248, 0.62)" },
					65: { value: "rgba(250, 250, 248, 0.65)" },
					72: { value: "rgba(250, 250, 248, 0.72)" },
					82: { value: "rgba(250, 250, 248, 0.82)" },
				},
				softAccent: { value: "#ECF0FF" },
				softDanger: { value: "#FCEBEC" },
				softSuccess: { value: "#E5F4EC" },
				softWarning: { value: "#FFF5D9" },
				success: { value: "#277A58" },
				successSoft: { value: "#A9D8C1" },
				surface: { value: "#FFFFFF" },
				warning: { value: "#D2A33C" },
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
				heading: {
					value:
						'"Bricolage Grotesque Variable", "Bricolage Grotesque", sans-serif',
				},
				mono: {
					value: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
				},
			},
			radii: squareRadii,
		},
	},
});

export const system = createSystem(defaultConfig, interviewTheme);
