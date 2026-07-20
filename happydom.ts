import { GlobalRegistrator } from '@happy-dom/global-registrator';

// Register Happy-DOM globals before any tests run. A real URL (instead of the
// about:blank default) is required for history.replaceState/pushState with
// relative URLs, which the battle-link sync uses. Resource loading is disabled
// so the fake origin doesn't trigger fetches for linked assets.
GlobalRegistrator.register({
  url: 'http://localhost:3000/',
  settings: {
    disableJavaScriptFileLoading: true,
    disableCSSFileLoading: true,
    // Treat intentionally disabled linked assets as loaded. Happy DOM otherwise
    // reports one NotSupportedError every time app tests install index.html.
    handleDisabledFileLoadingAsSuccess: true,
  },
});
