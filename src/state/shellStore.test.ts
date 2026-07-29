// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/engine/save/schema';
import { resetShellStoreForTests, useShellStore } from './shellStore';

const shell = () => useShellStore.getState();

beforeEach(() => {
  resetShellStoreForTests();
});

describe('shellStore — settings', () => {
  it('starts from the documented defaults', () => {
    expect(shell().settings).toEqual(DEFAULT_SETTINGS);
  });

  it('patches settings without disturbing the rest', () => {
    shell().setSettings({ motion: 'reduced' });
    expect(shell().settings.motion).toBe('reduced');
    expect(shell().settings.volume).toBe(DEFAULT_SETTINGS.volume);
  });

  it('toggles the nav rail', () => {
    expect(shell().settings.navCollapsed).toBe(false);
    shell().toggleNav();
    expect(shell().settings.navCollapsed).toBe(true);
    shell().toggleNav();
    expect(shell().settings.navCollapsed).toBe(false);
  });
});

describe('shellStore — toasts', () => {
  it('adds newest first so the stack shows the most recent three', () => {
    shell().pushToast({ title: 'First', ttl: 0 });
    shell().pushToast({ title: 'Second', ttl: 0 });

    expect(shell().toasts.map((toast) => toast.title)).toEqual(['Second', 'First']);
  });

  it('gives every toast a unique id and dismisses by it', () => {
    const first = shell().pushToast({ title: 'Keep', ttl: 0 });
    const second = shell().pushToast({ title: 'Drop', ttl: 0 });
    expect(first).not.toBe(second);

    shell().dismissToast(second);
    expect(shell().toasts).toHaveLength(1);
    expect(shell().toasts[0]?.title).toBe('Keep');
  });

  it('defaults to the info tone and carries an optional detail', () => {
    shell().pushToast({ title: 'Plain', ttl: 0 });
    shell().pushToast({ title: 'Detailed', detail: 'With a subtitle', tone: 'reward', ttl: 0 });

    const [detailed, plain] = shell().toasts;
    expect(plain?.tone).toBe('info');
    expect(plain?.detail).toBeUndefined();
    expect(detailed?.tone).toBe('reward');
    expect(detailed?.detail).toBe('With a subtitle');
  });

  it('auto-dismisses after its ttl', async () => {
    shell().pushToast({ title: 'Fleeting', ttl: 20 });
    expect(shell().toasts).toHaveLength(1);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(shell().toasts).toHaveLength(0);
  });

  it('clears the whole stack on request', () => {
    shell().pushToast({ title: 'A', ttl: 0 });
    shell().pushToast({ title: 'B', ttl: 0 });
    shell().clearToasts();
    expect(shell().toasts).toHaveLength(0);
  });

  it('dismissing an unknown id is harmless', () => {
    shell().pushToast({ title: 'A', ttl: 0 });
    expect(() => shell().dismissToast('nope')).not.toThrow();
    expect(shell().toasts).toHaveLength(1);
  });
});

describe('shellStore — HUD preview', () => {
  it('patches preview values', () => {
    shell().setPreview({ level: 12, gold: 5000 });
    expect(shell().preview.level).toBe(12);
    expect(shell().preview.gold).toBe(5000);
    expect(shell().preview.vigorMax).toBe(100);
  });
});
