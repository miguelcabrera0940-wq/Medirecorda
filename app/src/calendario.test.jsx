import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import Calendario from './components/Calendario.jsx';

describe('Calendario', () => {
  it('marca con punto solo los días que tienen tomas', () => {
    const fecha = new Date(2026, 9, 14);
    const { container } = render(
      <Calendario fecha={fecha} hoy={fecha} onCambiar={vi.fn()} tieneTomasEn={(dia) => dia.getDate() === 16} />,
    );

    const puntos = container.querySelectorAll('button > span.h-1');
    expect(puntos).toHaveLength(1);
    expect(puntos[0].closest('button').textContent).toBe('16');
  });
});
