import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  createTheme,
  defaultVariantColorsResolver,
  Drawer,
  HoverCard,
  Menu,
  Modal,
  MultiSelect,
  NavLink,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Table,
  Tabs,
  Textarea,
  TextInput,
  Tooltip,
  type CSSVariablesResolver,
  type MantineColorsTuple,
  type VariantColorsResolver,
} from '@mantine/core'
import { DateInput, MonthPickerInput } from '@mantine/dates'

/** 前端设计说明10.2：青碧色板，实心用第7档，浅色变体用第1档底、第9档字。 */
const jade: MantineColorsTuple = [
  '#e8f7f3',
  '#d3ede6',
  '#a7dbcd',
  '#77c8b3',
  '#4fb89d',
  '#36ae90',
  '#249d80',
  '#0f846b',
  '#06705b',
  '#005c4a',
]

export const palette = {
  pageBg: '#f4f6f8',
  border: '#e3e8ee',
  text: '#1b2733',
  textSecondary: '#5b6b7b',
}

const variantColorResolver: VariantColorsResolver = (input) => {
  const resolved = defaultVariantColorsResolver(input)
  if (input.variant === 'light' && (input.color ?? input.theme.primaryColor) === 'jade') {
    return { ...resolved, background: jade[1], hover: jade[2], color: jade[9], hoverColor: jade[9] }
  }
  return resolved
}

const fieldDefaults = { size: 'sm' as const }

export const theme = createTheme({
  primaryColor: 'jade',
  primaryShade: 7,
  colors: { jade },
  variantColorResolver,
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", "WenQuanYi Micro Hei", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontFamilyMonospace: '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, "Liberation Mono", "Noto Sans Mono CJK SC", monospace',
  defaultRadius: 'md',
  radius: { xs: '4px', sm: '6px', md: '8px', lg: '12px', xl: '16px' },
  fontSizes: { xs: '12px', sm: '13px', md: '14px', lg: '16px', xl: '18px' },
  lineHeights: { xs: '1.45', sm: '1.5', md: '1.55', lg: '1.6', xl: '1.6' },
  spacing: { xs: '6px', sm: '10px', md: '14px', lg: '20px', xl: '28px' },
  headings: {
    fontWeight: '650',
    sizes: {
      h1: { fontSize: '22px', lineHeight: '1.35' },
      h2: { fontSize: '18px', lineHeight: '1.4' },
      h3: { fontSize: '16px', lineHeight: '1.45' },
      h4: { fontSize: '14px', lineHeight: '1.5' },
    },
  },
  shadows: {
    xs: '0 1px 2px rgba(16, 32, 48, 0.04)',
    sm: '0 1px 3px rgba(16, 32, 48, 0.06), 0 1px 2px rgba(16, 32, 48, 0.04)',
    md: '0 6px 16px rgba(16, 32, 48, 0.08)',
    lg: '0 12px 32px rgba(16, 32, 48, 0.12)',
    xl: '0 20px 48px rgba(16, 32, 48, 0.16)',
  },
  cursorType: 'pointer',
  components: {
    Button: Button.extend({ defaultProps: { size: 'sm', radius: 'md' }, styles: { root: { fontWeight: 600 } } }),
    ActionIcon: ActionIcon.extend({ defaultProps: { variant: 'subtle', color: 'gray' } }),
    Badge: Badge.extend({
      defaultProps: { radius: 'sm', variant: 'light', size: 'md' },
      styles: { root: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 } },
    }),
    Card: Card.extend({ defaultProps: { radius: 'lg', withBorder: true, padding: 'lg', shadow: 'xs' } }),
    Paper: Paper.extend({ defaultProps: { radius: 'lg' } }),
    TextInput: TextInput.extend({ defaultProps: fieldDefaults }),
    Textarea: Textarea.extend({ defaultProps: { ...fieldDefaults, autosize: true, minRows: 2 } }),
    NumberInput: NumberInput.extend({ defaultProps: { ...fieldDefaults, thousandSeparator: ',' } }),
    Select: Select.extend({ defaultProps: { ...fieldDefaults, allowDeselect: false, checkIconPosition: 'right' } }),
    MultiSelect: MultiSelect.extend({ defaultProps: { ...fieldDefaults, checkIconPosition: 'right' } }),
    DateInput: DateInput.extend({ defaultProps: { ...fieldDefaults, valueFormat: 'YYYY-MM-DD' } }),
    MonthPickerInput: MonthPickerInput.extend({ defaultProps: { ...fieldDefaults, valueFormat: 'YYYY-MM' } }),
    SegmentedControl: SegmentedControl.extend({ defaultProps: { size: 'sm', radius: 'md' } }),
    Table: Table.extend({ defaultProps: { verticalSpacing: 'xs', fz: 'sm', highlightOnHover: true } }),
    Tabs: Tabs.extend({ defaultProps: { keepMounted: false } }),
    Modal: Modal.extend({
      defaultProps: { radius: 'lg', centered: true, overlayProps: { backgroundOpacity: 0.35, blur: 2 } },
      styles: { title: { fontWeight: 650, fontSize: '16px' } },
    }),
    Drawer: Drawer.extend({ defaultProps: { overlayProps: { backgroundOpacity: 0.35, blur: 2 } } }),
    Tooltip: Tooltip.extend({ defaultProps: { withArrow: true, multiline: true, maw: 320, openDelay: 120 } }),
    HoverCard: HoverCard.extend({ defaultProps: { shadow: 'md', withArrow: true, radius: 'md' } }),
    Menu: Menu.extend({ defaultProps: { shadow: 'md', radius: 'md' } }),
    NavLink: NavLink.extend({ styles: { root: { borderRadius: 'var(--mantine-radius-md)' }, label: { fontSize: '13px' } } }),
    Alert: Alert.extend({ defaultProps: { radius: 'md', variant: 'light' } }),
  },
})

export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    '--qs-page-bg': palette.pageBg,
    '--qs-border': palette.border,
  },
  light: {
    '--mantine-color-text': palette.text,
    '--mantine-color-dimmed': palette.textSecondary,
    '--mantine-color-default-border': palette.border,
  },
  dark: {},
})
