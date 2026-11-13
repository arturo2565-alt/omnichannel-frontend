import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('el laboratorio queda en la bandeja y /lab redirige con sesión', () => {
  const main = read('../src/main.jsx');
  const rail = read('../src/OmnichannelLeftRail.jsx');
  const app = read('../src/App.jsx');
  const chat = read('../src/ChatView.jsx');

  assert.match(main, /path="\/lab"[\s\S]*<ProtectedRoute>[\s\S]*<Navigate to="\/" replace \/>/);
  assert.doesNotMatch(main, /LabPage/);
  assert.doesNotMatch(rail, /to="\/lab"|FlaskConical/);
  assert.match(app, /createLabConversation/);
  assert.match(chat, /Nueva prueba/);
  assert.match(chat, /onCreateLabTrial/);
});

test('en móvil solo la barra inferior muestra Dashboard y Calendario', () => {
  const chat = read('../src/ChatView.jsx');
  const rail = read('../src/OmnichannelLeftRail.jsx');
  const headerStart = chat.indexOf('flex shrink-0 items-center gap-2 lg:hidden');
  const header = chat.slice(headerStart, headerStart + 700);

  assert.doesNotMatch(chat, /to="\/dashboard"|to="\/calendar"/);
  assert.match(header, /Cerrar sesión/);
  assert.match(header, /ThemeToggle/);
  assert.match(rail, /to="\/dashboard"[\s\S]*title="Dashboard"/);
  assert.match(rail, /title: 'Inicio', icon: ChartNoAxesCombined/);
  assert.match(rail, /title: 'Citas', icon: Calendar/);
  assert.match(rail, /hidden min-h-0 w-20[\s\S]*lg:flex/);
  assert.match(rail, /lg:hidden/);
});

test('Dashboard usa ChartNoAxesCombined en la navegación y en la página', () => {
  const rail = read('../src/OmnichannelLeftRail.jsx');
  const dashboard = read('../src/DashboardView.jsx');

  assert.match(rail, /ChartNoAxesCombined/);
  assert.doesNotMatch(rail, /LayoutDashboard/);
  assert.match(dashboard, /ChartNoAxesCombined className="h-5 w-5" strokeWidth=\{2\}/);
  assert.match(dashboard, /hidden[\s\S]*lg:inline-flex/);
  assert.doesNotMatch(dashboard, /LayoutDashboard/);
});
