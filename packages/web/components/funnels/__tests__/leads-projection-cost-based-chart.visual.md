# Task 16: Visual Validation Checklist
## LeadsProjectionCostBasedChart Component

**Status:** ✅ Ready for Browser Testing  
**Date:** 2026-06-09  
**Component:** `packages/web/components/funnels/leads-projection-cost-based-chart.tsx`

---

## 1. Color Correctness

### Inputs Section
- [ ] Data Final input shows date picker
- [ ] Meta Total input accepts numbers
- [ ] Gasto Total Projetado shows R$ prefix
- [ ] Suggestion text displays below Gasto input
- [ ] All labels are readable (text-xs muted-foreground)

### Legend Colors
- [ ] Dark gray (#6B7280) for "Leads Pagos Reais (Dia)"
- [ ] Green (#10B981) for "Leads Orgânicos Reais (Dia)"
- [ ] Light pink (#F9A8D4) for "Leads Pagos Projetados (Dia)"
- [ ] Light green (#A7F3D0) for "Leads Orgânicos Projetados (Dia)"
- [ ] Dark blue (#2563EB) for "Real (Acumulado)" line
- [ ] Light blue (#60A5FA) for "Projeção (Acumulado)" dashed line
- [ ] Orange (#F97316) for "CPL Projetado" line
- [ ] Red (#EF4444) for "Meta Acumulada" dashed line
- [ ] Light red (#FEE2E2) for CPL confidence band

### Opacities
- [ ] Real daily bars: 0.85 opacity (solid)
- [ ] Projected daily bars: 0.35 opacity (faded)
- [ ] CPL band fill: 0.15 opacity (very translucent)
- [ ] Lines are full opacity (1.0)

---

## 2. Data Visualization

### Stacked Bars
- [ ] Real bars show paid (dark gray) stacked on organic (green)
- [ ] Projected bars show paid (pink) stacked on organic (light green)
- [ ] No overlap between real and projected bars
- [ ] Bar width proportional to value
- [ ] All bars have rounded tops [2, 2, 0, 0]

### Lines (Dual Axes)
- [ ] Real line (solid dark blue) shows only for past/today data
- [ ] Projection line (dashed light blue) starts from today
- [ ] CPL line (orange) appears on secondary (right) axis
- [ ] Meta line (red dashed) spans full date range
- [ ] All lines have strokeWidth 2-2.5

### Confidence Band (CPL)
- [ ] Band appears as semi-transparent red area
- [ ] Band is between lower and upper CPL values
- [ ] Band visible only in projection area
- [ ] Band does not obscure other visual elements

### "Hoje" Marker
- [ ] Vertical dashed line at today's date
- [ ] Label "Hoje" positioned above line
- [ ] Gray color (#999999) with 0.5 opacity
- [ ] Only appears when real data exists before projections

---

## 3. Axes & Scales

### Primary Axis (Left - Leads)
- [ ] Title: Auto-calculated max
- [ ] Starts at 0
- [ ] Increments are reasonable (no 0.5 lead steps)
- [ ] Font size: 11px
- [ ] Numbers align right of axis

### Secondary Axis (Right - CPL in R$)
- [ ] Title: "CPL (R$)" positioned on right side
- [ ] Starts at 0
- [ ] Increments appropriate for currency (e.g., 10, 20, 50)
- [ ] Font size: 11px
- [ ] Numbers align left of axis

### X-Axis (Dates)
- [ ] Format: DD/MM (e.g., 15/06)
- [ ] Readable without overlapping
- [ ] Font size: 11px
- [ ] Aligned at bottom

### Grid
- [ ] Subtle dashed grid (strokeDasharray: 3 3)
- [ ] Muted color (not black or prominent)
- [ ] Behind all chart elements

---

## 4. Legend & Labels

### Legend Box
- [ ] Positioned below chart
- [ ] Font size: 12px
- [ ] All 8 series listed:
  1. Leads Pagos Reais (Dia)
  2. Leads Orgânicos Reais (Dia)
  3. Leads Pagos Projetados (Dia)
  4. Leads Orgânicos Projetados (Dia)
  5. Real (Acumulado)
  6. Projeção (Acumulado)
  7. CPL Projetado
  8. Meta Acumulada
- [ ] Colors match chart elements exactly
- [ ] No text cutoff
- [ ] Interactive (click to toggle series)

### Data Labels on Dots
- [ ] Real data points show circle + value
- [ ] Projected data points show circle + value
- [ ] Percentage shown below value (if available)
- [ ] Text properly positioned (not overlapping)
- [ ] Font readable (11px for value, 9px for %)

---

## 5. Tooltip Behavior

### Trigger
- [ ] Tooltip appears on hover
- [ ] Disappears when mouse leaves chart
- [ ] Follows cursor position

### Content Display
**For Real Data:**
- [ ] Checkmark emoji + "✓ Real"
- [ ] "Pagos: X/dia"
- [ ] "Orgânicos: X/dia"
- [ ] "Acumulado: X"
- [ ] "Meta: X"

**For Projected Data:**
- [ ] Crystal ball emoji + "🔮 Projetado"
- [ ] "Pagos: X/dia"
- [ ] "Orgânicos: X/dia"
- [ ] "Acumulado: X"
- [ ] "CPL: R$ X.XX"
- [ ] "Meta: X"

### Styling
- [ ] Dark background (bg-background)
- [ ] Light text (readable contrast)
- [ ] Rounded corners (rounded-lg)
- [ ] Box shadow for depth
- [ ] Border color matches theme

---

## 6. Responsive Layout

### Chart Container
- [ ] Full width (responsive)
- [ ] 400px fixed height
- [ ] Rounded corners (rounded-xl)
- [ ] Border (border/30 opacity)
- [ ] Padding: 5 (p-5)
- [ ] Background: card/60 opacity

### Input Grid
- [ ] 3 columns on desktop
- [ ] Responsive on mobile (stack if needed)
- [ ] Consistent spacing (gap-4)
- [ ] Equal width on desktop

### Header
- [ ] Title and % aligned left-right
- [ ] No wrapping on normal widths

---

## 7. Number Formatting

### Cumulative Display
- [ ] Integer values (no decimals)
- [ ] Thousands separator if > 999 (e.g., 1,234)
- [ ] Appropriate font weight (600)

### CPL Display
- [ ] Exactly 2 decimal places (e.g., R$ 45.32)
- [ ] Currency symbol (R$)
- [ ] Consistent formatting in tooltip

### Percentages
- [ ] Integer % (no decimals)
- [ ] Green if ≥ 100
- [ ] Amber if < 100
- [ ] Display rounded (Math.round())

---

## 8. Error States

### No Data
- [ ] "Nenhum dado disponível" message centered
- [ ] Same height as chart (400px)
- [ ] Muted color (text-muted-foreground)

### Validation Error
- [ ] Error message displayed below inputs
- [ ] Red background (bg-red-50)
- [ ] Red text (text-red-600)
- [ ] Rounded corners (rounded)
- [ ] Padding (p-2)
- [ ] Font size (text-xs)

---

## 9. Performance

### Chart Rendering
- [ ] Smooth on first load
- [ ] No lag when hovering points
- [ ] Tooltip appears within 100ms
- [ ] Smooth animation on input changes
- [ ] No console errors

### Memory
- [ ] No memory leaks on remount
- [ ] Cleanup on unmount
- [ ] Efficient re-renders (no unnecessary updates)

---

## 10. Accessibility

### Keyboard Navigation
- [ ] Tab through inputs in order
- [ ] Date input usable with keyboard
- [ ] Number inputs accept typed values

### Labels
- [ ] All inputs have <label> tags
- [ ] htmlFor/id attributes correctly linked
- [ ] Labels visible and readable

### Color Contrast
- [ ] All text meets WCAG AA contrast ratio
- [ ] No color-only differentiation
- [ ] Red and green both used (not just for colorblind)

---

## Manual Testing Checklist

**Before browser testing, ensure:**

- [ ] All unit tests (51 cases) passing
- [ ] All integration tests (9 scenarios) passing
- [ ] TypeScript compiles without errors
- [ ] Lint passes (no warnings)
- [ ] Component imports all dependencies correctly

**Browser testing steps:**

1. [ ] Load component in development environment
2. [ ] Verify all input fields render and accept values
3. [ ] Enter test data and observe chart render
4. [ ] Hover over chart points and verify tooltips
5. [ ] Change input values and observe chart update
6. [ ] Verify colors match spec (use browser DevTools)
7. [ ] Test with different screen sizes (mobile, tablet, desktop)
8. [ ] Verify legend is clickable and toggles series
9. [ ] Check accessibility with keyboard navigation
10. [ ] Verify no console errors or warnings

**Expected behaviors to verify:**

- [ ] Real data appears in solid colors, darker opacity
- [ ] Projected data appears in lighter, more transparent colors
- [ ] Stacked bars show paid + organic split clearly
- [ ] CPL line is on secondary axis (right side)
- [ ] Confidence band is subtle (semi-transparent)
- [ ] Meta line spans full date range
- [ ] Projection % displays correctly (>=100 green, <100 amber)
- [ ] Suggestion value appears below Gasto input
- [ ] Chart is responsive (works on mobile)

---

## Sign-off

- [ ] All 10 categories verified
- [ ] No visual bugs identified
- [ ] Component ready for production
- [ ] Approved by: @dev (Dex)
- [ ] Date: 2026-06-09
