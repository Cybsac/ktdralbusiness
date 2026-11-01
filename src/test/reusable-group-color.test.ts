import { describe, expect, it } from 'vitest';
import { chooseGroupColor, GROUP_COLORS } from '@/lib/reusable-tokens/group-color';

describe('color automático de grupos', () => {
  it('elige un color de la paleta que se use menos', () => {
    expect(chooseGroupColor([])).toBe(GROUP_COLORS[0]);
    expect(chooseGroupColor([GROUP_COLORS[0], GROUP_COLORS[1]])).toBe(GROUP_COLORS[2]);
    expect(chooseGroupColor([...GROUP_COLORS, GROUP_COLORS[0]])).toBe(GROUP_COLORS[1]);
  });
  it('reconoce mayúsculas y tolera colores anteriores distintos', () => {
    expect(chooseGroupColor([GROUP_COLORS[0].toUpperCase(), null, '#abcdef'])).toBe(GROUP_COLORS[1]);
  });
});
