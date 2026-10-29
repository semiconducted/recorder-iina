import { describe, expect, it, vi } from 'vitest';
import { setupRecorder } from '../src/recorder';

type MenuAction = () => void;

function createApi(windowLoaded: boolean) {
  let isWindowLoaded = windowLoaded;
  let windowLoadedHandler: (() => void) | undefined;
  const menuActions = new Map<string, MenuAction>();

  const sidebarMessageHandlers = new Map<string, (payload?: unknown) => void>();
  const onMessage = vi.fn((name: string, handler: (payload?: unknown) => void) => {
    sidebarMessageHandlers.set(name, handler);
  });
  const loadFile = vi.fn(() => sidebarMessageHandlers.clear());
  const showSidebar = vi.fn();
  const hideSidebar = vi.fn();
  const addMenuItem = vi.fn();
  const postMessage = vi.fn();
  const seekTo = vi.fn();
  const onEvent = vi.fn((event: string, handler: () => void) => {
    if (event === 'iina.window-loaded') windowLoadedHandler = handler;
    return 'event-id';
  });

  const api = {
    sidebar: {
      loadFile,
      onMessage,
      postMessage,
      show: showSidebar,
      hide: hideSidebar,
    },
    menu: {
      item: vi.fn((title: string, action: MenuAction) => {
        menuActions.set(title, action);
        return { title };
      }),
      addItem: addMenuItem,
    },
    core: {
      seekTo,
      window: {
        get loaded() {
          return isWindowLoaded;
        },
      },
    },
    event: {
      on: onEvent,
    },
    mpv: {
      getNumber: vi.fn(() => 12.5),
    },
    preferences: {
      get: vi.fn(() => ''),
    },
    utils: {
      fileInPath: vi.fn(() => false),
    },
    overlay: {
      simpleMode: vi.fn(),
      setContent: vi.fn(),
      setStyle: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
    },
  } as unknown as IINA.IINAGlobal;

  return {
    api,
    loadFile,
    onMessage,
    showSidebar,
    hideSidebar,
    addMenuItem,
    onEvent,
    postMessage,
    seekTo,
    setWindowLoaded: (loaded: boolean) => {
      isWindowLoaded = loaded;
    },
    getSidebarMessageNames: () => [...sidebarMessageHandlers.keys()],
    invokeSidebarMessage: (name: string, payload?: unknown) => {
      sidebarMessageHandlers.get(name)?.(payload);
    },
    getWindowLoadedHandler: () => windowLoadedHandler,
    getMenuAction: (title = 'Start Clipping') => menuActions.get(title),
  };
}

describe('setupRecorder', () => {
  it('registers the menu immediately and waits for the player window before loading the sidebar', () => {
    const recorder = createApi(false);

    setupRecorder(recorder.api);

    expect(recorder.addMenuItem).toHaveBeenCalledTimes(3);
    expect(recorder.loadFile).not.toHaveBeenCalled();
    expect(recorder.onMessage).not.toHaveBeenCalled();
    expect(recorder.onEvent).toHaveBeenCalledWith('iina.window-loaded', expect.any(Function));

    recorder.setWindowLoaded(true);
    recorder.getWindowLoadedHandler()?.();
    recorder.getWindowLoadedHandler()?.();

    expect(recorder.loadFile).toHaveBeenCalledOnce();
    expect(recorder.loadFile).toHaveBeenCalledWith('dist/ui/window/index.html');
    expect(recorder.getSidebarMessageNames()).toEqual([
      'markTime',
      'seekTo',
      'processVideoClip',
      'closeWindow',
      'ready',
    ]);

    recorder.invokeSidebarMessage('closeWindow');
    expect(recorder.hideSidebar).toHaveBeenCalledOnce();
  });

  it('loads the sidebar immediately when plugins are reloaded into an existing window', () => {
    const recorder = createApi(true);

    setupRecorder(recorder.api);

    expect(recorder.addMenuItem).toHaveBeenCalledTimes(3);
    expect(recorder.loadFile).toHaveBeenCalledOnce();
    expect(recorder.onEvent).not.toHaveBeenCalledWith('iina.window-loaded', expect.any(Function));
  });

  it('does not access the sidebar from the menu action until the player window is loaded', () => {
    const recorder = createApi(false);

    setupRecorder(recorder.api);
    recorder.getMenuAction()?.();

    expect(recorder.loadFile).not.toHaveBeenCalled();
    expect(recorder.showSidebar).not.toHaveBeenCalled();

    recorder.setWindowLoaded(true);
    recorder.getMenuAction()?.();
    recorder.getWindowLoadedHandler()?.();

    expect(recorder.loadFile).toHaveBeenCalledOnce();
    expect(recorder.showSidebar).toHaveBeenCalledOnce();
  });

  it('marks the playhead as In or Out from the sidebar and the menu', () => {
    const recorder = createApi(true);

    setupRecorder(recorder.api);
    recorder.invokeSidebarMessage('markTime', { mark: 'in' });
    recorder.getMenuAction('Set Clip Out')?.();
    recorder.invokeSidebarMessage('markTime', { mark: 'bogus' });

    expect(recorder.postMessage).toHaveBeenCalledWith('mark', { mark: 'in', time: 12.5 });
    expect(recorder.postMessage).toHaveBeenCalledWith('mark', { mark: 'out', time: 12.5 });
    expect(recorder.postMessage).not.toHaveBeenCalledWith(
      'mark',
      expect.objectContaining({ mark: 'bogus' }),
    );
    expect(recorder.showSidebar).toHaveBeenCalledOnce();
  });

  it('seeks only to valid times', () => {
    const recorder = createApi(true);

    setupRecorder(recorder.api);
    recorder.invokeSidebarMessage('seekTo', { time: 83.5 });
    recorder.invokeSidebarMessage('seekTo', { time: -1 });
    recorder.invokeSidebarMessage('seekTo', { time: 'later' });

    expect(recorder.seekTo).toHaveBeenCalledOnce();
    expect(recorder.seekTo).toHaveBeenCalledWith(83.5);
  });
});
