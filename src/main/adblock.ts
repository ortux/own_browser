/**
 * Inbuilt ad & tracker blocker.
 *
 * Works at the Electron session level so it covers every <webview> tab:
 *  - Network blocking: `webRequest.onBeforeRequest` cancels requests whose host
 *    (or path) matches a bundled list of known ad / tracker / analytics domains.
 *  - Cosmetic blocking: injects CSS into webview documents to hide the empty
 *    containers left behind by blocked elements.
 *
 * The toggle is driven by the renderer's `security.blockTrackers` setting via
 * the `adblock:set` IPC channel.
 */

import { app, session, webContents, type WebContents } from 'electron';

let enabled = true;
let blockedCount = 0;
let mainWindowGetter: (() => WebContents | null) | null = null;
let statsTimer: ReturnType<typeof setTimeout> | null = null;

// insertCSS() styles survive for the lifetime of the current document. Keep the
// returned keys so turning the blocker off restores the page immediately rather
// than requiring a reload.
const cosmeticCssKeys = new Map<number, string>();

const YOUTUBE_PAGE_HOSTS = [
  'youtube.com',
  'youtube-nocookie.com',
  'youtu.be',
] as const;

function isHostOrSubdomain(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return host === domain || host.endsWith(`.${domain}`);
}

function isYouTubePageUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const host = new URL(value).hostname;
    return YOUTUBE_PAGE_HOSTS.some((domain) => isHostOrSubdomain(host, domain));
  } catch {
    return false;
  }
}

/**
 * Hosts known to serve ads, trackers, analytics, beacons, telemetry and
 * cookie-consent scripts. Matching is done on the full hostname (and any
 * subdomain), so `pagead2.googlesyndication.com` is blocked by `googlesyndication.com`.
 */
const BASE_BLOCKED_HOSTS: string[] = [

    // ── Google ad / analytics stack ──
    'doubleclick.net',
    'googlesyndication.com',
    'googleadservices.com',
    'google-analytics.com',
    'googletagmanager.com',
    'googletagservices.com',
    'admob.com',
    'g.doubleclick.net',
    'adservice.google.com',
    'adservice.google.com.br',
    'pagead2.googlesyndication.com',
    'tpc.googlesyndication.com',
    'ssl.google-analytics.com',
    'www.google-analytics.com',
    'analytics.google.com',
    'static.doubleclick.net',

    // ── Meta / Facebook ──
    'facebook.net',
    'connect.facebook.net',
    'pixel.facebook.com',
    'tr.facebook.com',
    'adsrvr.facebook.com',

    // ── Microsoft / Bing ──
    'bat.bing.com',
    'msads.net',
    'ads.microsoft.com',

    // ── Amazon ──
    'amazon-adsystem.com',
    'aax.amazon-adsystem.com',
    'adservice.amazon.com',

    // ── Criteo ──
    'criteo.com',
    'criteo.net',
    'static.criteo.net',
    'criteo.pub',

    // ── The Trade Desk ──
    'adsrvr.org',
    'adsvr.org',

    // ── AppNexus / Xandr ──
    'appnexus.com',
    'appnexus.net',
    'adnxs.com',
    'ib.adnxs.com',

    // ── Rubicon / Magnite ──
    'rubiconproject.com',
    'fastlane.rubiconproject.com',
    'rubiconproject.net',
    'prebid.magnite.com',

    // ── PubMatic ──
    'pubmatic.com',
    'ads.pubmatic.com',
    'pubmatic.net',

    // ── OpenX ──
    'openx.net',
    'openx.com',

    // ── Index Exchange ──
    'indexexchange.com',
    'indexexchange.net',

    // ── Sovrn / Lijit ──
    'sovrn.com',
    'lijit.com',
    'lijit.net',

    // ── Casale / Media.net / Conversant ──
    'casalemedia.com',
    'ad.casalemedia.com',
    'media.net',
    'conversantmedia.com',
    'conversantmedia.net',
    'mathtag.com',

    // ── Adform / Smart / AdRoll ──
    'adform.net',
    'adform.com',
    'smartadserver.com',
    'smartadserver.net',
    'adroll.com',

    // ── Native / recommender widgets ──
    'taboola.com',
    'taboola-api.com',
    'outbrain.com',
    'mgid.com',
    'revcontent.com',
    'zergnet.com',
    'sharethrough.com',
    'teads.tv',
    'districtm.net',
    'districtm.ca',
    'yieldmo.com',
    'triplelift.com',
    'beachfront.com',
    'unrulymedia.com',
    'adblade.com',
    'content.ad',
    'adoperator.com',
    '33across.com',
    'deepintent.com',
    'gumgum.com',
    'bidswitch.net',
    'sonobi.com',
    'sonobi.net',
    'adscale.de',
    'adspirit.de',
    'advertising.com',
    'adtech.com',
    'adtech.de',
    'adyouneed.com',

    // ── Analytics / measurement ──
    'hotjar.com',
    'static.hotjar.com',
    'script.hotjar.com',
    'mixpanel.com',
    'segment.com',
    'api.segment.io',
    'amplitude.com',
    'api.amplitude.com',
    'kissmetrics.com',
    'heapanalytics.com',
    'heap.io',
    'fullstory.com',
    'mouseflow.com',
    'inspectlet.com',
    'crazyegg.com',
    'optimizely.com',
    'luckyorange.com',
    'clicktale.com',
    'scorecardresearch.com',
    'quantserve.com',
    'quantcast.com',
    'moatads.com',
    'moat.com',
    'branch.io',
    'appsflyer.com',
    'adjust.com',
    'cleverreach.com',

    // ── Social pixels / beacons ──
    'px.ads.linkedin.com',
    'ads-twitter.com',
    'static.ads-twitter.com',
    'analytics.tiktok.com',
    'ads.tiktok.com',
    'pix.tiktok.com',
    'pixel.reddit.com',
    'ads-api.reddit.com',
    'snaptr.co',
    'track.hubspot.com',
    'js.hs-analytics.com',
    'js.hs-scripts.com',

    // ── Cookie consent / CMP ──
    'consentmanager.net',
    'cookielaw.org',
    'cdn.cookielaw.org',
    'onetrust.com',
    'optanon.com',
    'cookiebot.com',
    'consensu.org',

    // ── Misc trackers / beacons ──
    'scorecardresearch.com',
    'static.criteo.net',
    'adservice.google.com',
    '2mdn.net',
    'doubleclick.net',
    'adzerk.net',
    'engine.adzerk.net',
    'admitad.com',
    'yieldlab.net',
    'adition.com',
    'adcell.de',
    'belboon.de',
    'tradedoubler.com',
    'afi.sc',
    'postaffiliatepro.com',
    'pxl1.net',
    'tracker.com',
    'clickmeter.com',
    'statcounter.com',
    'histats.com',
    'propellerads.com',
    'popads.net',
    'exoclick.com',
    'trafficjunky.net',
    'juicyads.com',
    'plugrush.com',
    'adultadworld.com',
];

/**
 * Additional ad / analytics / SDK / telemetry / affiliate endpoints reported
 * by an ad-blocker test as still reachable. Added to harden the blocklist.
 */
const EXTRA_BLOCKED_HOSTS: string[] = [
  // S3-hosted ad buckets
  'adtago.s3.amazonaws.com',
  'analyticsengine.s3.amazonaws.com',
  'advice-ads.s3.amazonaws.com',
  // Amazon ads / device metrics
  'advertising-api-eu.amazon.com',
  'aan.amazon.com',
  'fls-na.amazon.com',
  'device-metrics-us.amazon.com',
  'device-metrics-us-2.amazon.com',
  'mads-eu.amazon.com',
  // AdColony
  'ads30.adcolony.com',
  'adc3-launch.adcolony.com',
  'events3alt.adcolony.com',
  'wd.adcolony.com',
  // Bing
  'c.bing.com',
  // AppLovin
  'applovin.com',
  'd.applovin.com',
  'rt.applovin.com',
  // Vungle / Liftoff / htlbid
  'api.vungle.com',
  'vungle.com',
  'liftoff.io',
  'htlbid.com',
  // Yahoo / Verizon Media
  'ads.yahoo.com',
  'analytics.yahoo.com',
  'geo.yahoo.com',
  'udc.yahoo.com',
  'udcm.yahoo.com',
  'advertising.yahoo.com',
  'analytics.query.yahoo.com',
  'partnerads.ysm.yahoo.com',
  'log.fc.yahoo.com',
  'gemini.yahoo.com',
  'adtech.yahooinc.com',
  // Unity Ads
  'auction.unityads.unity3d.com',
  'webview.unityads.unity3d.com',
  'config.unityads.unity3d.com',
  'adserver.unityads.unity3d.com',
  // Yandex
  'metrika.yandex.ru',
  'adfox.yandex.ru',
  'adfstat.yandex.ru',
  'appmetrica.yandex.ru',
  'mc.yandex.ru',
  'advertising.yandex.ru',
  // Chartboost / Supersonic / Fyber / InMobi / IronSource
  'live.chartboost.com',
  'init.supersonicads.com',
  'outcome-ssp.supersonicads.com',
  'api.fyber.com',
  'inmobi.com',
  'ironsource.mobi',
  // YouTube / Google video — NOTE: only the ad endpoint is blocked.
  // `s.youtube.com` serves YouTube's core JS/CSS and `redirector.googlevideo.com`
  // serves video streams, so those must NOT be blocked or the site breaks.
  'ads.youtube.com',
  // Misc ad nets
  'smartyads.com',
  'ad.gt',
  'contextweb.com',
  'stackadapt.com',
  'eb2.3lift.com',
  'tlx.3lift.com',
  'cdn.kargo.com',
  'sync.kargo.com',
  'pangleglobal.com',
  'doubleverify.com',
  'cdn.doubleverify.com',
  'tps.doubleverify.com',
  'pixel.adsafeprotected.com',
  'static.adsafeprotected.com',
  'fw.adsafeprotected.com',
  'insightexpressai.com',
  // Google analytics subdomains
  'click.googleanalytics.com',
  'tagmanager.google.com',
  'dai.google.com',
  'fundingchoicesmessages.google.com',
  // Adobe / Clarity / Freshmarketer
  'analytics.adobe.io',
  'c.clarity.ms',
  's.clarity.ms',
  'claritybt.freshmarketer.com',
  'fwtracks.freshmarketer.com',
  // LuckyOrange
  'upload.luckyorange.net',
  'cs.luckyorange.net',
  'settings.luckyorange.net',
  // WordPress / Cloudflare / PostHog / Rudder / Snowplow
  'stats.wp.com',
  'cloudflareinsights.com',
  'app.posthog.com',
  'eu.posthog.com',
  'us.i.posthog.com',
  'cdn.rudderlabs.com',
  'rudderstack.com',
  'snowplowanalytics.com',
  // Fingerprinting / fraud
  'fingerprintjs.com',
  'siftscience.com',
  'cdn.siftscience.com',
  'cdn.permutive.com',
  'onetag-sys.com',
  'pippio.com',
  'id5-sync.com',
  // Lotame / LiveRamp / Experian / rlcdn
  'bcp.crwdcntrl.net',
  'tags.crwdcntrl.net',
  'ad.crwdcntrl.net',
  'sync.crwdcntrl.net',
  'sync-tm.everesttech.net',
  'prod.uidapi.com',
  'idsync.rlcdn.com',
  'api.rlcdn.com',
  // Branch / Kochava / Singular / Braze
  'bnc.lt',
  'kochava.com',
  'control.kochava.com',
  'sdk-api-v1.singular.net',
  'wzrkt.com',
  // Crash / error reporters
  'notify.bugsnag.com',
  'sessions.bugsnag.com',
  'api.bugsnag.com',
  'app.bugsnag.com',
  'browser.sentry-cdn.com',
  'app.getsentry.com',
  'o0.ingest.sentry.io',
  'bam-cell.nr-data.net',
  'bam.nr-data.net',
  'js-agent.newrelic.com',
  'rum.browser-intake-datadoghq.com',
  'cdn.lr-ingest.com',
  'r.lr-ingest.com',
  // Crypto miners / popunder
  'coinimp.com',
  'www.coinimp.com',
  'monerominer.rocks',
  'popcash.net',
  'clickadu.com',
  'statdynamic.com',
  // Facebook / Instagram
  'an.facebook.com',
  'graph.facebook.com',
  'graph.instagram.com',
  'i.instagram.com',
  'sc-static.net',
  'tr.snapchat.com',
  'sc-analytics.appspot.com',
  // LinkedIn / Twitter / X
  'analytics.pointdrive.linkedin.com',
  'snap.licdn.com',
  'dc.ads.linkedin.com',
  'ads-api.twitter.com',
  'ads-api.x.com',
  'analytics.twitter.com',
  'analytics.x.com',
  'ads.x.com',
  // Reddit
  'events.reddit.com',
  'events.redditmedia.com',
  'd.reddit.com',
  // TikTok / ByteDance
  'ads-api.tiktok.com',
  'ads-sg.tiktok.com',
  'analytics-sg.tiktok.com',
  'business-api.tiktok.com',
  'log.byteoversea.com',
  'mon.byteoversea.com',
  'mcs-va.tiktokv.com',
  'mon.tiktokv.com',
  // Pinterest / Quora / Tumblr
  'ads.pinterest.com',
  'ct.pinterest.com',
  'log.pinterest.com',
  'analytics.pinterest.com',
  'trk.pinterest.com',
  'widgets.pinterest.com',
  'pixel.quora.com',
  'qevents.quora.com',
  'px.srvcs.tumblr.com',
  // VK / Mail.ru
  'ads.vk.com',
  'ad.mail.ru',
  'top-fwz1.mail.ru',
  // Apple
  'advertising.apple.com',
  'tr.iadsdk.apple.com',
  'iadsdk.apple.com',
  'metrics.icloud.com',
  'metrics.mzstatic.com',
  'api-adservices.apple.com',
  'books-analytics-events.apple.com',
  'notes-analytics-events.apple.com',
  'xp.apple.com',
  // OEMs (Realme / Oppo / OnePlus / Huawei / Xiaomi / Samsung / LG)
  'iot-eu-logser.realme.com',
  'iot-logser.realme.com',
  'bdapi-ads.realmemobile.com',
  'bdapi-in-ads.realmemobile.com',
  'adx.ads.oppomobile.com',
  'ck.ads.oppomobile.com',
  'data.ads.oppomobile.com',
  'open.oneplus.net',
  'metrics.data.hicloud.com',
  'metrics2.data.hicloud.com',
  'grs.hicloud.com',
  'logservice.hicloud.com',
  'logservice1.hicloud.com',
  'logbak.hicloud.com',
  'ads.huawei.com',
  'api.ad.xiaomi.com',
  'data.mistat.xiaomi.com',
  'data.mistat.india.xiaomi.com',
  'data.mistat.rus.xiaomi.com',
  'sdkconfig.ad.xiaomi.com',
  'sdkconfig.ad.intl.xiaomi.com',
  'tracking.rus.miui.com',
  'tracking.miui.com',
  'samsungads.com',
  'smetrics.samsung.com',
  'samsung-com.112.2o7.net',
  'analytics-api.samsunghealthcn.com',
  'config.samsungads.com',
  'us.info.lgsmartad.com',
  'ngfts.lge.com',
  // SmartClip / Microsoft / MSN
  'smartclip.net',
  'smartclip.com',
  'vortex.data.microsoft.com',
  'browser.events.data.msn.com',
  // Roku / Crashlytics
  'ads.roku.com',
  'firebase-settings.crashlytics.com',
  // CMP / consent
  'consent.trustarc.com',
  'sdk.privacy-center.org',
  'cdn.privacy-mgmt.com',
  'app.usercentrics.eu',
  'cmp.inmobi.com',
  'cmp.osano.com',
  // Affiliate networks
  'www.anrdoezrs.net',
  'www.dpbolvw.net',
  'www.tkqlhce.com',
  'click.linksynergy.com',
  'ad.linksynergy.com',
  'track.linksynergy.com',
  'd.impactradius-event.com',
  'www.awin1.com',
  'zenaps.com',
  'prf.hn',
  'partnerstack.com',
  'api.partnerstack.com',
  'refersion.com',
  't.pepperjamnetwork.com',
  's.skimresources.com',
  't.skimresources.com',
  'go.skimresources.com',
  'redirector.skimresources.com',
  'go.redirectingat.com',
  'cdn.viglink.com',
  'api.viglink.com',
  'redirect.viglink.com',
  // Dynamic Yield / LaunchDarkly / marketing
  'cdn.dynamicyield.com',
  'st.dynamicyield.com',
  'events.launchdarkly.com',
  'clientstream.launchdarkly.com',
  'munchkin.marketo.net',
  'click.mailchimp.com',
  'widget.intercom.io',
  'js.driftt.com',
  'sdk.iad-01.braze.com',
  'cdn.onesignal.com',
  'api.onesignal.com',
  'static.klaviyo.com',
  'a.klaviyo.com',
  'customer.io',
  'track.customer.io',
  // Video ad servers
  'g.jwpsrv.com',
  'ssl.p.jwpcdn.com',
  'prd.jwpltx.com',
  'mssl.fwmrm.net',
  'bea4.v.fwmrm.net',
  '2975c.v.fwmrm.net',
  'cd.connatix.com',
  'capi.connatix.com',
  'vid.connatix.com',
  'metrics.brightcove.com',
  's.innovid.com',
  'tremorhub.com',
  'ads.tremorhub.com',
];

const BLOCKED_HOSTS: ReadonlySet<string> = new Set(
  [...BASE_BLOCKED_HOSTS, ...EXTRA_BLOCKED_HOSTS].map((h) => h.toLowerCase())
);

/**
 * URL-path patterns for resources that are almost always ads/trackers even on
 * hosts we don't fully block (e.g. a social pixel living on the main domain).
 */
const BLOCK_PATTERNS: ReadonlyArray<RegExp> = [
  // Meta / LinkedIn / Snap / TikTok / Twitter tracking pixels
  /(?:^|\.)facebook\.com\/tr(?:[?#]|$)/i,
  /(?:^|\.)linkedin\.com\/px/i,
  /(?:^|\.)snapchat\.com\/p/i,
  /\/rtrg(\/|\?|$)/i,
  /(?:^|\.)twitter\.com\/i\/adsct/i,
  /(?:^|\.)tiktok\.com\/(?:pixel|event)/i,
  // Google ad click identifiers on otherwise-allowed hosts
  /[?&](?:gclid|gclsrc|dclid|fbclid|msclkid|twclid)=/i,
  // Generic ad-serving path fragments
  /\/(?:ad|ads|adserver|ad-serve|adserv|admgr|adnxs|doubleclick|pagead|adform|openx|pubmatic|rubicon|criteo|taboola|outbrain|mgid|revcontent)\b/i,
  /\/(?:pixel|beacon|track(?:er|ing)?|imp(?:ression)?|tag(?:\.js)?|analytics|collect)\.(?:php|js|gif|png|json)/i,
  /\b(?:ad_|ads_|adserve|ad-server|banner|creative|impression|sponsor)\b/i,
];

/**
 * CSS used to collapse known ad slots after their network requests are blocked.
 *
 * Keep this deliberately conservative. The old rules matched generic fragments
 * such as `popup`, `banner`, `promo`, `recommended`, and even any class containing
 * `ads`. Those fragments are also used by real dialogs and controls (for example
 * a share popup), leaving invisible overlays that swallowed every click beneath
 * them. Network filtering does the actual blocking; cosmetic rules must never be
 * broad enough to break page functionality.
 */
const COSMETIC_CSS = `
ins.adsbygoogle,
[id^="google_ads_iframe_"],
[id^="google_ads_frame"],
[id^="div-gpt-ad-"],
[data-ad-slot]:not([data-ad-slot=""]),
[data-ad-unit]:not([data-ad-unit=""]),
[data-google-query-id],
.ad-container[data-ad],
.ad-wrapper[data-ad],
.taboola-widget,
[id^="taboola-"],
.OUTBRAIN,
iframe[src*="doubleclick.net"],
iframe[src*="googlesyndication.com"]
{ display: none !important; }
`;

function hostMatches(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return true;
  for (const blocked of BLOCKED_HOSTS) {
    if (host.endsWith(`.${blocked}`)) return true;
  }
  return false;
}

function isBlocked(url: string): boolean {
  try {
    const u = new URL(url);
    // Only http(s) resources can be ads; never block the document itself.
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (hostMatches(u.hostname)) return true;
    const pathAndQuery = `${u.pathname}${u.search}`;
    for (const pattern of BLOCK_PATTERNS) {
      if (pattern.test(pathAndQuery)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function emitStats() {
  if (!mainWindowGetter) return;
  const win = mainWindowGetter();
  if (win && !win.isDestroyed()) {
    win.send('adblock:stats', { enabled, blocked: blockedCount });
  }
}

async function removeCosmeticCss(contents: WebContents): Promise<void> {
  const key = cosmeticCssKeys.get(contents.id);
  if (!key) return;

  cosmeticCssKeys.delete(contents.id);
  if (contents.isDestroyed()) return;

  try {
    await contents.removeInsertedCSS(key);
  } catch {
    // Navigation may already have discarded the old document and its CSS key.
  }
}

async function refreshCosmeticCss(contents: WebContents): Promise<void> {
  await removeCosmeticCss(contents);

  // YouTube's player and dialogs are sensitive to page modifications. It is
  // already exempt from network filtering below, so exempt it from cosmetic
  // filtering as well.
  if (!enabled || contents.isDestroyed() || isYouTubePageUrl(contents.getURL())) return;

  try {
    const pageUrl = contents.getURL();
    const key = await contents.insertCSS(COSMETIC_CSS);

    // insertCSS is asynchronous. Do not leave the stylesheet attached if the
    // setting or page changed while it was being inserted.
    if (
      !enabled ||
      contents.isDestroyed() ||
      contents.getURL() !== pageUrl ||
      isYouTubePageUrl(contents.getURL())
    ) {
      if (!contents.isDestroyed()) await contents.removeInsertedCSS(key).catch(() => {});
      return;
    }

    cosmeticCssKeys.set(contents.id, key);
  } catch {
    // webContents may have navigated away or been destroyed — ignore.
  }
}

export function initAdblock(getMainWindow: () => WebContents | null): void {
  mainWindowGetter = getMainWindow;

  const defaultSession = session.defaultSession;

  defaultSession.webRequest.onBeforeRequest((details, callback) => {
    // SECURITY/SAFETY: never let an exception abort a request silently.
    // If anything below throws, we allow the request rather than canceling it.
    try {
      if (!enabled) {
        callback({});
        return;
      }

      // Only filter requests coming from a <webview> tab, never the app shell.
      const source =
        details.webContents ??
        (details.webContentsId != null ? webContents.fromId(details.webContentsId) : null);
      if (!source || source.getType() !== 'webview') {
        callback({});
        return;
      }

      // YouTube treats partially-blocked player/API traffic as a failed client:
      // videos stop, lazy-loaded comments never arrive, and controls can become
      // inert. The source URL can still be about:blank during the first burst of
      // requests, so also inspect the frame URL and referrer.
      const isYouTubeRequest = [
        source.getURL(),
        details.frame?.url,
        details.referrer,
        details.url,
      ].some(isYouTubePageUrl);
      if (isYouTubeRequest) {
        callback({});
        return;
      }

      // Never block the top-level document of the tab itself.
      if (details.resourceType === 'mainFrame') {
        callback({});
        return;
      }

      if (isBlocked(details.url)) {
        blockedCount++;
        // Throttle stats emission to at most once per ~500ms.
        if (!statsTimer) {
          statsTimer = setTimeout(() => {
            statsTimer = null;
            emitStats();
          }, 500);
        }
        callback({ cancel: true });
      } else {
        callback({});
      }
    } catch {
      // On any unexpected error, allow the request (fail open).
      callback({});
    }
  });

  // Inject cosmetic CSS into webview documents as they load.
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() !== 'webview') return;
    contents.on('dom-ready', () => void refreshCosmeticCss(contents));
    contents.once('destroyed', () => cosmeticCssKeys.delete(contents.id));
  });

  emitStats();
}

export function setAdblockEnabled(value: boolean): void {
  enabled = value;

  // Apply/remove cosmetic filtering on webviews that are already open. Network
  // filtering reads `enabled` on each request and changes immediately.
  for (const contents of webContents.getAllWebContents()) {
    if (contents.getType() === 'webview' && !contents.isDestroyed()) {
      if (enabled) void refreshCosmeticCss(contents);
      else void removeCosmeticCss(contents);
    }
  }

  emitStats();
}

export function isAdblockEnabled(): boolean {
  return enabled;
}

export function getBlockedCount(): number {
  return blockedCount;
}
