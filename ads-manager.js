/**
 * 🎯 ADS MANAGER SYSTEM - Refactored, Optimized, and Cleaned
 * -------------------------------------------------------------
 * Features:
 * ✅ Anti-AdBlock Detection (Elements, Script, and Fetch checks)
 * ✅ Click-Triggered Smartlink with session limits & cooldowns
 * ✅ Popunder and Vignette Ads with session capping
 * ✅ Dynamic Ad Scaling (Zero Clipping Solution)
 * ✅ Responsive Ad Container Injection & Adapters
 * 
 * 💡 DOMAIN CUSTOMIZATION GUIDE:
 * To customize ads for a specific domain, create a folder at:
 *   `scraper/database/domains/[your-domain]/`
 * And place your customized `ads.json` or `ads-manager.js` files there.
 * The build pipeline will automatically use them as overrides during generation.
 */

class AdsManager {
  constructor() {
    this.config = null;
    this.rotationTimers = {};
    this.pendingTimeouts = {};
    this.mutationObserver = null;
    this.sessionData = this.getSessionData();
    this.isAdBlockDetected = false;
    this.adElements = new Map();
    this.loadedScripts = new Set();
    this.popunderCount = 0;
    this.vignetteTimer = null;
  }

  // === 📐 Dynamic Ad Scaling (Zero Clipping) ===
  scaleAdElement(adElement) {
    if (!adElement || !adElement.parentElement) return;
    
    const container = adElement.closest('[id^="ad-"]') || adElement.parentElement;
    if (!container) return;
    
    const containerWidth = container.clientWidth;
    const adWidth = adElement.offsetWidth || adElement.scrollWidth;
    
    if (adWidth > containerWidth && adWidth > 0) {
      const scale = containerWidth / adWidth;
      const scaleValue = Math.min(scale, 0.95);
      
      adElement.style.transform = `scale(${scaleValue})`;
      adElement.style.transformOrigin = 'top center';
      adElement.style.maxWidth = '100%';
      adElement.style.overflow = 'hidden';
      
      console.log(`📐 Scaling ad: ${adWidth}px -> ${containerWidth}px`);
    }
  }

  scaleAllAds() {
    document.querySelectorAll('.ad-banner iframe, .ad-banner ins, div[id^="banner-"], div[id^="sidebar-"]')
      .forEach(ad => this.scaleAdElement(ad));
  }

  startAdScalingSystem() {
    console.log('📏 Starting ad scaling system...');
    
    let debounceTimer = null;
    const debouncedScaleAll = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.scaleAllAds();
      }, 150);
    };

    const observer = new MutationObserver((mutations) => {
      let shouldScale = false;
      for (const mutation of mutations) {
        const target = mutation.target;
        if (target.closest && (target.closest('[id^="ad-"]') || target.closest('.ad-banner'))) {
          shouldScale = true;
          break;
        }
      }
      if (shouldScale) {
        debouncedScaleAll();
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    this.mutationObserver = observer;
    
    setInterval(() => this.scaleAllAds(), 3000);
    window.addEventListener('resize', () => debouncedScaleAll());
  }

  // === 🚀 Initialization ===
  async init() {
    try {
      this.filterUnityErrors();
      this.fixAdContainers();
      
      const response = await fetch('ads.json');
      if (!response.ok) throw new Error('Failed to load ads.json');
      
      this.config = await response.json();
      console.log('✅ Ad config loaded successfully');
      
      const antiAdblockEnabled = this.config.antiAdblock?.enabled ?? true;
      if (antiAdblockEnabled) {
        console.log('🔍 Checking for AdBlock...');
        const adBlockDetected = await this.detectAdBlockEffectively();
        
        if (adBlockDetected) {
          console.log('🚫 AdBlock detected - blocking access');
          this.blockPageAccess();
          return;
        }
      } else {
        console.log('⚠️ Anti-AdBlock disabled - skipping check');
      }
      
      await this.loadAllAds();
      console.log('🎯 All ads initialized successfully');
      this.startAdScalingSystem();
      
    } catch (error) {
      console.error('❌ Error initializing ads:', error);
      this.showFallbackAds();
    }
  }

  // === 🔍 AdBlock Detection ===
  async detectAdBlockEffectively() {
    const test1 = await this.testAdElement();
    const test2 = await this.testAdScript();
    const test3 = await this.testAdFetch();
    
    const failures = [test1, test2, test3].filter(Boolean).length;
    this.isAdBlockDetected = failures >= 2;
    
    console.log('📊 AdBlock Detection Result:', this.isAdBlockDetected ? '🚫 DETECTED' : '✅ NOT DETECTED');
    return this.isAdBlockDetected;
  }

  async testAdElement() {
    return new Promise(resolve => {
      const adElement = document.createElement('div');
      adElement.id = 'adblock-test-element-' + Date.now();
      
      const adClasses = ['ad', 'ads', 'advertisement', 'advert', 'ad-banner', 'ad-container', 'sponsor'];
      adClasses.forEach(c => adElement.classList.add(c));
      
      adElement.innerHTML = `<div style="width: 728px; height: 90px; background: #1a2a6c;">Advertisement</div>`;
      adElement.style.cssText = 'position: fixed; top: -9999px; left: -9999px; width: 728px; height: 90px; opacity: 0.01; pointer-events: none; z-index: -9999;';
      
      document.body.appendChild(adElement);
      
      setTimeout(() => {
        const computedStyle = window.getComputedStyle(adElement);
        const isBlocked = 
          adElement.offsetHeight === 0 ||
          adElement.offsetWidth === 0 ||
          computedStyle.display === 'none' ||
          computedStyle.visibility === 'hidden' ||
          !document.body.contains(adElement);
        
        adElement.remove();
        resolve(isBlocked);
      }, 500);
    });
  }

  async testAdScript() {
    return new Promise(resolve => {
      const testScript = document.createElement('script');
      testScript.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
      testScript.id = 'adblock-test-script-' + Date.now();
      testScript.async = true;
      
      let scriptLoaded = false;
      let scriptBlocked = false;
      
      testScript.onload = () => {
        scriptLoaded = true;
        resolve(false);
      };
      
      testScript.onerror = () => {
        scriptBlocked = true;
        resolve(true);
      };
      
      document.head.appendChild(testScript);
      
      setTimeout(() => {
        if (!scriptLoaded && !scriptBlocked) {
          testScript.remove();
          resolve(true);
        }
      }, 2000);
    });
  }

  async testAdFetch() {
    try {
      await fetch('https://google-analytics.com/analytics.js', {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-cache'
      });
      return false;
    } catch (error) {
      return true;
    }
  }

  // === ⛔ Page Blocking Overlay ===
  blockPageAccess() {
    const blockOverlay = document.createElement('div');
    blockOverlay.id = 'adblock-block-overlay';
    blockOverlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
      z-index: 2147483647; display: flex; justify-content: center; align-items: center;
      flex-direction: column; padding: 20px; text-align: center; color: white;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; overflow: hidden;
    `;
    
    blockOverlay.addEventListener('contextmenu', e => e.preventDefault());
    blockOverlay.addEventListener('keydown', e => {
      if (e.key === 'F12' || e.key === 'F5' || (e.ctrlKey && e.shiftKey && e.key === 'I') || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    });
    
    blockOverlay.innerHTML = `
      <div style="background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(20px); border-radius: 20px; padding: 40px; max-width: 800px; width: 90%; border: 2px solid rgba(255, 68, 68, 0.5); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);">
        <div style="font-size: 80px; color: #ff4444; margin-bottom: 20px;">🚫</div>
        <h1 style="font-size: 2.5rem; color: #ffd700; margin-bottom: 20px;">Ad Blocker Detected</h1>
        <div style="background: rgba(0, 0, 0, 0.4); border-radius: 15px; padding: 25px; margin-bottom: 25px; line-height: 1.7; text-align: left;">
          <p style="font-size: 18px; margin-bottom: 15px;"><strong>We have detected that you are using an ad blocker.</strong></p>
          <p style="margin-bottom: 15px; font-size: 16px;">Our website is <strong>100% free</strong> and relies exclusively on advertisements to operate. By blocking ads, you prevent us from offering free gaming content.</p>
          <div style="background: rgba(255, 68, 68, 0.2); border-left: 4px solid #ff4444; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; font-weight: bold; color: #ffd700;">⚠️ <strong>Access Denied:</strong> Disable your ad blocker to access games.</p>
          </div>
          <h3 style="color: #3498db; margin: 20px 0 15px 0;">📋 To Continue:</h3>
          <ol style="margin-left: 20px; font-size: 16px;">
            <li style="margin-bottom: 8px;">Disable your ad blocker for this website</li>
            <li style="margin-bottom: 8px;">Refresh this page</li>
            <li style="margin-bottom: 8px;">Add our site to your whitelist</li>
          </ol>
        </div>
        <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; margin-top: 30px;">
          <button onclick="window.location.reload()" style="background: linear-gradient(135deg, #2ecc71, #27ae60); color: white; border: none; padding: 16px 35px; border-radius: 10px; cursor: pointer; font-size: 18px; font-weight: bold; transition: all 0.3s; min-width: 250px;">🔄 I've Disabled It - Refresh</button>
          <button onclick="window.showAdBlockHelp()" style="background: linear-gradient(135deg, #3498db, #2980b9); color: white; border: none; padding: 16px 35px; border-radius: 10px; cursor: pointer; font-size: 18px; font-weight: bold; transition: all 0.3s; min-width: 250px;">📖 How to Disable Ad Block</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(blockOverlay);
    this.disableOriginalPage();
    window.showAdBlockHelp = () => this.showAdBlockHelp();
  }

  disableOriginalPage() {
    document.body.classList.add('adblock-blocked');
    document.querySelectorAll('a, button, input, select, textarea, iframe, [onclick]').forEach(el => {
      el.style.pointerEvents = 'none';
      el.style.opacity = '0.3';
      el.style.filter = 'blur(2px)';
    });
    
    const gameIframe = document.getElementById('game-iframe');
    if (gameIframe) {
      gameIframe.style.pointerEvents = 'none';
      gameIframe.style.opacity = '0.2';
      gameIframe.style.filter = 'blur(5px) grayscale(1)';
    }
    
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  }

  showAdBlockHelp() {
    const helpOverlay = document.createElement('div');
    helpOverlay.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: linear-gradient(135deg, #1a2a6c, #302b63); padding: 40px;
      border-radius: 20px; max-width: 900px; width: 90%; max-height: 80vh;
      overflow-y: auto; z-index: 2147483648; color: white;
      box-shadow: 0 30px 80px rgba(0,0,0,0.6); border: 2px solid #3498db;
    `;
    
    helpOverlay.innerHTML = `
      <div style="position: relative;">
        <button onclick="this.parentElement.parentElement.remove()" style="position: absolute; top: 15px; right: 15px; background: #ff4444; color: white; border: none; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 20px;">✕</button>
        <h2 style="text-align: center; margin-bottom: 30px; color: #ffd700;">How to Disable Ad Blocker</h2>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
          <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 10px;">
            <h3 style="color: #2ecc71;">AdBlock Plus</h3>
            <ol>
              <li>Click the AdBlock Plus icon</li>
              <li>Click "Don't run on pages on this domain"</li>
              <li>Refresh the page</li>
            </ol>
          </div>
          <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 10px;">
            <h3 style="color: #3498db;">uBlock Origin</h3>
            <ol>
              <li>Click the uBlock Origin icon</li>
              <li>Click the big power button</li>
              <li>Refresh the page</li>
            </ol>
          </div>
          <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 10px;">
            <h3 style="color: #9b59b6;">AdGuard</h3>
            <ol>
              <li>Click the AdGuard icon</li>
              <li>Disable protection for this site</li>
              <li>Refresh the page</li>
            </ol>
          </div>
        </div>
        <div style="text-align: center; margin-top: 30px;">
          <button onclick="location.reload()" style="background: #2ecc71; color: white; border: none; padding: 15px 30px; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold;">Refresh After Disabling</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(helpOverlay);
  }

  // === 📦 Loading Ad Formats ===
  async loadAllAds() {
    console.log('📦 Ingesting all active ad configurations...');
    
    // 1. Sidebar Native banner (Immediate)
    this.loadNativeBanner();
    
    // 2. Sidebar Rotated Banner
    setTimeout(() => this.loadSidebarAds(), 500);
    
    // 3. Central iFrame & Footer Banners
    await this.delay(1000);
    this.loadBanners();
    
    // 4. Social Sticky Bar
    await this.delay(1500);
    this.loadSocialBar();
    
    // 5. Middle Inline Ad
    await this.delay(2000);
    this.loadMiddleAd();
    
    // 6. Extra Sidebar Ad
    await this.delay(2500);
    this.loadExtraSidebarAd();
    
    // 7. Click-triggered smartlink & Popunder
    await this.delay(3000);
    this.loadPopunder();
    this.loadSmartlink();

    // 8. Full-page Vignette Banner
    await this.delay(3500);
    this.loadVignetteBanner(); 

    // 9. Monetag In-Page Push notifications
    await this.delay(4000);
    this.loadInPagePush();
  }

  async loadBanners() {
    if (this.config.banners?.aboveIframe?.enabled) {
      this.loadBannerAd('ad-above-iframe', this.config.banners.aboveIframe);
    }
    
    if (this.config.banners?.belowIframe?.enabled) {
      setTimeout(() => {
        this.loadBannerAd('ad-below-iframe', this.config.banners.belowIframe);
      }, 1000);
    }
    
    if (this.config.banners?.pageBottom?.enabled) {
      setTimeout(() => {
        this.loadBannerAd('ad-page-bottom', this.config.banners.pageBottom);
      }, 1500);
    }
  }

  loadBannerAd(containerId, bannerConfig) {
    const container = this.ensureContainerExists(containerId);
    if (!container) return;
    
    const ads = bannerConfig.ads;
    if (!ads || ads.length === 0) return;
    
    this.loadAdIntoContainer(container, ads[0], containerId);
    
    // Setup Rotation Timer if enabled
    if (bannerConfig.rotation && ads.length > 1) {
      let currentIndex = 0;
      const interval = bannerConfig.rotationInterval || 30000;
      
      if (this.rotationTimers[containerId]) {
        clearInterval(this.rotationTimers[containerId]);
      }
      
      this.rotationTimers[containerId] = setInterval(() => {
        currentIndex = (currentIndex + 1) % ads.length;
        this.loadAdIntoContainer(container, ads[currentIndex], containerId);
      }, interval);
    }
  }

  // === 📢 Core Script Loader ===
  loadAdIntoContainer(container, ad, containerId) {
    if (!ad || !ad.script) return;
    
    console.log(`📢 Loading ad: ${ad.id} inside ${containerId}`);
    const uniqueId = `${ad.id}-${Date.now()}`;
    
    window.atOptions = window.atOptions || {};
    Object.assign(window.atOptions, {
      ...ad.config,
      params: ad.config?.params || {}
    });
    
    const adDiv = document.createElement('div');
    adDiv.className = `ad-banner ad-modern-wrapper ${containerId === 'sidebar' ? 'ad-sidebar' : ''}`;
    adDiv.setAttribute('data-ad-id', ad.id);
    adDiv.setAttribute('data-container', containerId);
    
    const minHeight = ad.config?.height || (containerId.includes('sidebar') ? 300 : 90);
    adDiv.innerHTML = `
      <div class="ad-label">Advertisement</div>
      <div class="ad-content-scaler" id="banner-${uniqueId}" style="text-align:center;min-height:${minHeight}px;background:transparent;"></div>
    `;
    
    container.innerHTML = '';
    container.appendChild(adDiv);
    
    if (this.pendingTimeouts[containerId]) {
      clearTimeout(this.pendingTimeouts[containerId]);
    }
    
    this.pendingTimeouts[containerId] = setTimeout(() => {
      const script = document.createElement('script');
      script.src = ad.script;
      script.async = true;
      script.setAttribute('data-cfasync', 'false');
      script.id = `script-${uniqueId}`;
      
      script.onload = () => {
        console.log(`✅ Ad loaded: ${ad.id}`);
        setTimeout(() => {
          const adElement = document.getElementById(`banner-${uniqueId}`);
          if (adElement) this.scaleAdElement(adElement);
        }, 1000);
      };
      
      script.onerror = () => {
        console.warn(`⚠️ Ad failed: ${ad.id}`);
        this.showFallbackInContainer(container);
      };
      
      const targetElement = document.getElementById(`banner-${uniqueId}`);
      if (targetElement) {
        targetElement.appendChild(script);
      }
      delete this.pendingTimeouts[containerId];
    }, 300);
  }

  loadMiddleAd() {
    if (!this.config.banners?.pageMiddle?.enabled) return;
    this.loadBannerAd('ad-page-middle', this.config.banners.pageMiddle);
  }

  loadExtraSidebarAd() {
    if (!this.config.sidebarAdExtra?.enabled) return;
    
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar || sidebar.querySelector('#ad-sidebar-extra')) return;
    
    const extraContainer = document.createElement('div');
    extraContainer.id = 'ad-sidebar-extra';
    extraContainer.style.cssText = 'min-height: 300px; margin: 20px 0; background: rgba(0,0,0,0.7); border-radius: 8px; padding: 15px; position: relative; overflow: hidden;';
    
    const existingAd = sidebar.querySelector('#ad-sidebar');
    if (existingAd && existingAd.nextSibling) {
      sidebar.insertBefore(extraContainer, existingAd.nextSibling);
    } else {
      sidebar.appendChild(extraContainer);
    }
    
    this.loadBannerAd('ad-sidebar-extra', this.config.sidebarAdExtra);
  }

  loadNativeBanner() {
    if (!this.config.nativeBanner?.enabled) return;
    
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      if (sidebar.querySelector('.native-ad-banner')) return;
      
      const container = document.createElement('div');
      container.className = 'ad-banner native-ad-banner ad-modern-wrapper';
      container.innerHTML = this.config.nativeBanner.html || '<div id="native-banner-container" class="ad-content-scaler"></div>';
      
      sidebar.insertBefore(container, sidebar.firstChild);
      this.injectNativeScript(container);
    } else {
      const grid = document.querySelector('.grid');
      if (grid && !document.getElementById('ad-native-grid')) {
        const container = document.createElement('article');
        container.id = 'ad-native-grid';
        container.className = 'card ad-banner native-ad-banner';
        container.style.cssText = 'padding: 15px; display: flex; flex-direction: column; justify-content: center; align-items: center; background: rgba(22, 28, 45, 0.7); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; min-height: 250px; position: relative;';
        container.innerHTML = `<div class="ad-label" style="position: absolute; top: 8px; right: 8px; background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); font-size: 10px; padding: 2px 6px; border-radius: 3px; font-weight: bold;">Sponsored</div>` + (this.config.nativeBanner.html || '<div id="native-banner-container" class="ad-content-scaler"></div>');
        
        const children = grid.children;
        if (children.length >= 9) {
          grid.insertBefore(container, children[8]);
        } else {
          grid.appendChild(container);
        }
        
        this.injectNativeScript(container);
      }
    }
  }

  injectNativeScript(container) {
    if (!this.config.nativeBanner.script) return;
    setTimeout(() => {
      const script = document.createElement('script');
      script.src = this.config.nativeBanner.script;
      script.async = true;
      script.setAttribute('data-cfasync', 'false');
      container.appendChild(script);
    }, 1000);
  }

  loadSidebarAds() {
    if (!this.config.sidebarAd?.enabled) return;
    
    const container = this.ensureContainerExists('ad-sidebar');
    const ads = this.config.sidebarAd.ads;
    if (!ads || ads.length === 0) return;
    
    this.loadAdIntoContainer(container, ads[0], 'sidebar');
    
    if (this.config.sidebarAd.rotation && ads.length > 1) {
      let currentIndex = 0;
      const interval = this.config.sidebarAd.rotationInterval || 45000;
      
      if (this.rotationTimers['sidebar']) {
        clearInterval(this.rotationTimers['sidebar']);
      }
      
      this.rotationTimers['sidebar'] = setInterval(() => {
        currentIndex = (currentIndex + 1) % ads.length;
        this.loadAdIntoContainer(container, ads[currentIndex], 'sidebar');
      }, interval);
    }
  }

  loadSocialBar() {
    if (!this.config.socialBar?.enabled || !this.config.socialBar.script) return;
    if (this.loadedScripts.has(this.config.socialBar.script)) return;
    
    setTimeout(() => {
      const script = document.createElement('script');
      script.src = this.config.socialBar.script;
      script.async = true;
      script.setAttribute('data-cfasync', 'false');
      script.id = 'social-bar-script';
      
      document.body.appendChild(script);
      this.loadedScripts.add(this.config.socialBar.script);
    }, this.config.socialBar.delay || 5000);
  }

  // === 🔀 Popunder & Smartlinks ===
  loadPopunder() {
    if (!this.config.popunder?.enabled) return;
    
    const maxPerSession = this.config.popunder.maxPerSession || 1;
    if (this.sessionData.popunderCount >= maxPerSession) return;
    
    setTimeout(() => {
      this.config.popunder.scripts.forEach((scriptUrl, index) => {
        if (this.loadedScripts.has(scriptUrl)) return;
        
        const script = document.createElement('script');
        script.src = scriptUrl;
        script.async = true;
        script.setAttribute('data-cfasync', 'false');
        script.id = `popunder-script-${index}`;
        
        document.body.appendChild(script);
        this.loadedScripts.add(scriptUrl);
      });
      
      this.sessionData.popunderCount = (this.sessionData.popunderCount || 0) + 1;
      this.sessionData.popunderShown = true;
      this.saveSessionData();
    }, this.config.popunder.delay || 8000);
  }

  loadSmartlink() {
    if (!this.config.smartlink?.enabled) return;
    
    if (this.config.smartlink.mode === 'popunder' && this.config.smartlink.triggerOnClick) {
      this.setupSmartlinkPopunder();
    } else {
      this.openSmartlinkDirect();
    }
  }

  setupSmartlinkPopunder() {
    const minInterval = this.config.smartlink.minIntervalBetweenShows || 180000;
    const maxShows = this.config.smartlink.maxShowsPerSession || 5;
    
    if (this.sessionData.smartlinkCount >= maxShows) return;
    
    const lastShown = this.sessionData.lastSmartlinkShown;
    if (lastShown) {
      const timePassed = Date.now() - lastShown;
      if (timePassed < minInterval) {
        setTimeout(() => this.setupSmartlinkPopunder(), minInterval - timePassed);
        return;
      }
    }
    
    const clickHandler = (e) => {
      // Ignore clicks pointing to external URLs
      if (e.target.tagName === 'A' && e.target.href && e.target.href.startsWith('http')) return;
      
      this.openSmartlinkPopunder();
      document.removeEventListener('click', clickHandler);
      
      this.sessionData.smartlinkCount = (this.sessionData.smartlinkCount || 0) + 1;
      this.sessionData.lastSmartlinkShown = Date.now();
      this.saveSessionData();
      
      setTimeout(() => {
        if (this.sessionData.smartlinkCount < maxShows) {
          this.setupSmartlinkPopunder();
        }
      }, minInterval);
    };
    
    document.addEventListener('click', clickHandler);
  }

  openSmartlinkPopunder() {
    const url = this.config.smartlink.url;
    try {
      const newTab = window.open(url, '_blank', 'noopener,noreferrer');
      if (newTab) return true;
      
      window.open(url, '_blank');
      return false;
    } catch (e) {
      console.error('❌ Failed to open smartlink:', e);
      return false;
    }
  }

  openSmartlinkDirect() {
    if (this.sessionData.smartlinkOpened) return;
    
    const openSmartlink = () => {
      setTimeout(() => {
        if (this.config.smartlink.openInNewTab) {
          const newTab = window.open(this.config.smartlink.url, '_blank', 'noopener,noreferrer');
          if (newTab) {
            this.sessionData.smartlinkOpened = true;
            this.saveSessionData();
          }
        } else {
          window.location.href = this.config.smartlink.url;
        }
      }, this.config.smartlink.delay || 3000);
    };
    
    const checkGameLoaded = (attempt = 1) => {
      const iframe = document.getElementById('game-iframe');
      if (iframe && iframe.contentWindow) {
        openSmartlink();
      } else if (attempt < 10) {
        setTimeout(() => checkGameLoaded(attempt + 1), 1000);
      } else {
        openSmartlink();
      }
    };
    
    setTimeout(() => checkGameLoaded(), 2000);
  }

  loadInPagePush() {
    if (!this.config.inPagePush?.enabled) return;
    
    const { zone, script: scriptUrl, delay = 2000 } = this.config.inPagePush;
    if (!scriptUrl || !zone) return;
    
    const scriptKey = `inpagepush-${zone}`;
    if (this.loadedScripts.has(scriptKey)) return;
    
    setTimeout(() => {
      const script = document.createElement('script');
      script.dataset.zone = zone;
      script.src = scriptUrl;
      script.async = true;
      script.setAttribute('data-cfasync', 'false');
      
      document.body.appendChild(script);
      this.loadedScripts.add(scriptKey);
    }, delay);
  }

  loadVignetteBanner() {
    if (!this.config.vignetteBanner?.enabled) return;
    
    const { script: scriptUrl, zone = "10480837", delay = 1000, repeatInterval = 300000, maxShowsPerSession = 10 } = this.config.vignetteBanner;
    if (!scriptUrl) return;
    
    const scriptKey = `vignette-${scriptUrl}`;
    if (this.loadedScripts.has(scriptKey)) return;
    if (this.sessionData.vignetteCount >= maxShowsPerSession) return;
    
    const lastShown = this.sessionData.lastVignetteShown;
    if (lastShown) {
      const timePassed = Date.now() - lastShown;
      if (timePassed < repeatInterval) {
        if (this.vignetteTimer) clearTimeout(this.vignetteTimer);
        this.vignetteTimer = setTimeout(() => {
          this.loadedScripts.delete(scriptKey);
          this.loadVignetteBanner();
        }, repeatInterval - timePassed);
        return;
      }
    }
    
    setTimeout(() => {
      this.sessionData.vignetteCount = (this.sessionData.vignetteCount || 0) + 1;
      this.sessionData.lastVignetteShown = Date.now();
      this.saveSessionData();
      this.loadedScripts.add(scriptKey);
      
      const script = document.createElement('script');
      script.id = `vignette-script-${Date.now()}`;
      script.textContent = `
        (function(s) {
          s.dataset.zone = '${zone}';
          s.src = '${scriptUrl}';
        })([document.documentElement, document.body].filter(Boolean).pop().appendChild(document.createElement('script')));
      `;
      
      document.head.appendChild(script);
      
      if (this.sessionData.vignetteCount < maxShowsPerSession) {
        if (this.vignetteTimer) clearTimeout(this.vignetteTimer);
        this.vignetteTimer = setTimeout(() => {
          this.loadedScripts.delete(scriptKey);
          this.loadVignetteBanner();
        }, repeatInterval);
      }
    }, delay);
  }

  // === 🔧 DOM Layout Container Anchoring ===
  fixAdContainers() {
    const containers = ['ad-above-iframe', 'ad-below-iframe', 'ad-page-bottom', 'ad-sidebar', 'ad-page-middle'];
    containers.forEach(id => this.ensureContainerExists(id));
  }

  ensureContainerExists(containerId) {
    let container = document.getElementById(containerId);
    if (container) return container;
    
    container = document.createElement('div');
    container.id = containerId;
    container.className = 'ad-container-responsive';
    container.style.cssText = 'min-height: 50px; margin: 20px 0; position: relative; background: transparent; overflow: hidden; max-width: 100%;';
    
    if (containerId === 'ad-above-iframe') {
      const gameFrame = document.querySelector('.game-frame, #game-iframe');
      const gameContainer = document.querySelector('.game-container');
      if (gameFrame && gameFrame.parentNode) {
        gameFrame.parentNode.insertBefore(container, gameFrame);
      } else if (gameContainer) {
        gameContainer.prepend(container);
      } else {
        const gridContainer = document.querySelector('.container');
        if (gridContainer) gridContainer.parentNode.insertBefore(container, gridContainer);
      }
    } else if (containerId === 'ad-below-iframe') {
      const gameFrame = document.querySelector('.game-frame, #game-iframe');
      const gameContainer = document.querySelector('.game-container');
      if (gameFrame && gameFrame.parentNode) {
        gameFrame.parentNode.insertBefore(container, gameFrame.nextSibling);
      } else if (gameContainer) {
        gameContainer.appendChild(container);
      }
    } else if (containerId === 'ad-page-middle') {
      const gameFrame = document.querySelector('.game-frame, #game-iframe');
      if (gameFrame && gameFrame.parentNode) {
        gameFrame.parentNode.insertBefore(container, gameFrame.nextSibling);
      } else {
        const gameContainer = document.querySelector('.game-container');
        if (gameContainer) gameContainer.appendChild(container);
      }
    } else if (containerId === 'ad-page-bottom') {
      const seoContent = document.querySelector('.seo-content');
      const mainContent = document.querySelector('.main-content');
      const footer = document.querySelector('footer');
      if (seoContent && seoContent.parentNode) {
        seoContent.parentNode.insertBefore(container, seoContent.nextSibling);
      } else if (mainContent) {
        mainContent.appendChild(container);
      } else if (footer && footer.parentNode) {
        footer.parentNode.insertBefore(container, footer);
      }
    } else if (containerId === 'ad-sidebar') {
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) sidebar.appendChild(container);
    } else {
      document.body.appendChild(container);
    }
    
    return container;
  }

  showFallbackAds() {
    console.log('🔄 Rendering fallback ads...');
    const antiAdblockEnabled = this.config?.antiAdblock?.enabled ?? true;
    
    const fallbackHtml = antiAdblockEnabled ? `
      <div class="ad-banner ad-modern-wrapper" style="text-align:center;padding:20px;">
        <div class="ad-label">Advertisement</div>
        <p style="color:#fff;margin:10px 0;">Support our site by disabling your ad blocker</p>
        <a href="#" onclick="window.location.reload()" style="color:#3498db;text-decoration:none;">Refresh page</a>
      </div>
    ` : `
      <div class="ad-banner ad-modern-wrapper" style="text-align:center;padding:15px;">
        <div class="ad-label">Sponsored</div>
        <div style="color:#fff;padding:10px;">
          <p style="margin:5px 0;">Play more games at FreePlayHub</p>
          <a href="https://hanggames.github.io" style="color:#3498db;text-decoration:none;">Browse All Games</a>
        </div>
      </div>
    `;
    
    ['ad-above-iframe', 'ad-below-iframe', 'ad-sidebar', 'ad-page-middle', 'ad-page-bottom'].forEach(id => {
      const container = document.getElementById(id);
      if (container) container.innerHTML = fallbackHtml;
    });
  }

  showFallbackInContainer(container) {
    if (!container) return;
    
    const antiAdblockEnabled = this.config?.antiAdblock?.enabled ?? true;
    if (!antiAdblockEnabled) {
      container.innerHTML = `
        <div class="ad-banner ad-modern-wrapper" style="text-align:center;padding:15px;">
          <div class="ad-label">Sponsored</div>
          <div style="color:#fff;padding:10px;">
            <p style="margin:5px 0;">Play more games at FreePlayHub</p>
            <a href="https://hanggames.github.io" style="color:#3498db;text-decoration:none;">Browse All Games</a>
          </div>
        </div>
      `;
      return;
    }
    
    container.innerHTML = `
      <div class="ad-banner ad-modern-wrapper" style="text-align:center;padding:20px;">
        <div class="ad-label">Advertisement</div>
        <p style="color:#fff;margin:10px 0;">Support our site by allowing ads</p>
        <p style="color:rgba(255,255,255,0.7);font-size:12px;margin-top:10px;">Ad failed to load. Please check your blocker settings.</p>
      </div>
    `;
    
    setTimeout(() => {
      if (container.innerHTML.includes('Ad failed to load')) {
        container.innerHTML = `
          <div class="ad-banner ad-modern-wrapper" style="text-align:center;padding:15px;">
            <div class="ad-label">Sponsored</div>
            <div style="color:#fff;padding:10px;">
              <p style="margin:5px 0;">Play more games at FreePlayHub</p>
              <a href="https://hanggames.github.io" style="color:#3498db;text-decoration:none;">Browse All Games</a>
            </div>
          </div>
        `;
      }
    }, 15000);
  }

  // === 💾 Session Management ===
  getSessionData() {
    try {
      const data = sessionStorage.getItem('adsSessionData');
      return data ? JSON.parse(data) : {
        popunderShown: false,
        popunderCount: 0,
        smartlinkOpened: false,
        smartlinkCount: 0,
        lastSmartlinkShown: null,
        vignetteCount: 0,
        lastVignetteShown: null,
        sessionId: Date.now()
      };
    } catch (e) {
      return {
        popunderShown: false,
        popunderCount: 0,
        smartlinkOpened: false,
        sessionId: Date.now()
      };
    }
  }

  saveSessionData() {
    try {
      sessionStorage.setItem('adsSessionData', JSON.stringify(this.sessionData));
    } catch (e) {
      console.error('Failed to save session data:', e);
    }
  }

  filterUnityErrors() {
    const originalError = console.error;
    console.error = function(...args) {
      if (args[0] && typeof args[0] === 'string') {
        if (args[0].includes('The referenced script') || args[0].includes('is missing!')) return;
      }
      originalError.apply(console, args);
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  destroy() {
    Object.values(this.rotationTimers).forEach(timer => clearInterval(timer));
    this.rotationTimers = {};
    Object.values(this.pendingTimeouts).forEach(timeout => clearTimeout(timeout));
    this.pendingTimeouts = {};
    if (this.vignetteTimer) {
      clearTimeout(this.vignetteTimer);
      this.vignetteTimer = null;
    }
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
    this.loadedScripts.clear();
  }
}

// === Auto Run on DOM Load ===
document.addEventListener('DOMContentLoaded', () => {
  const adsManager = new AdsManager();
  adsManager.init();
  window.adsManager = adsManager;
  
  // Inject Responsive Ad CSS styles
  const style = document.createElement('style');
  style.textContent = `
    .ad-banner {
      background: rgba(0,0,0,0.7); border-radius: 8px; padding: 15px; margin: 20px 0;
      position: relative; backdrop-filter: blur(5px); border: 1px solid rgba(255,255,255,0.1);
      transition: all 0.3s ease; min-height: 50px; overflow: hidden !important;
      max-width: 100% !important; box-sizing: border-box !important;
      display: flex !important; flex-direction: column !important;
      align-items: center !important; justify-content: center !important; text-align: center !important;
    }
    .ad-modern-wrapper { width: 100% !important; height: auto !important; }
    .ad-content-scaler {
      display: inline-block !important; transition: all 0.3s ease !important;
      max-width: 100% !important; transform-origin: top center !important;
      overflow: hidden !important; position: relative !important;
    }
    .ad-banner:hover { border-color: rgba(255,255,255,0.3); box-shadow: 0 5px 15px rgba(0,0,0,0.3); }
    .ad-label {
      position: absolute; top: 8px; right: 8px; background: rgba(255,255,255,0.1);
      color: rgba(255,255,255,0.6); font-size: 10px; padding: 2px 6px; border-radius: 3px;
      font-weight: bold; letter-spacing: 0.5px; text-transform: uppercase; z-index: 10;
    }
    .ad-sidebar { position: sticky; top: 100px; margin-bottom: 20px; }
    .native-ad-banner { background: linear-gradient(135deg, rgba(26,42,108,0.8), rgba(178,31,31,0.8)); }
    #ad-above-iframe { margin-bottom: 15px; }
    #ad-below-iframe { margin-top: 15px; margin-bottom: 25px; }
    #ad-page-bottom { margin-top: 30px; margin-bottom: 20px; text-align: center; }
    #ad-page-middle { margin: 25px 0; text-align: center; }
    #ad-sidebar-extra { margin-top: 20px; }
    
    body.adblock-blocked > *:not(#adblock-block-overlay) {
      pointer-events: none !important; opacity: 0.3; filter: blur(2px);
    }
    #adblock-block-overlay, #adblock-block-overlay * {
      filter: none !important; opacity: 1 !important; pointer-events: auto !important;
    }
    .ad-container-responsive { max-width: 100vw !important; overflow-x: hidden !important; }
    .ad-banner iframe, .ad-banner ins, .ad-modern-wrapper iframe, .ad-modern-wrapper ins,
    div[id^="banner-"] iframe, div[id^="sidebar-"] iframe {
      max-width: 100% !important; max-height: 100% !important;
      transform-origin: top center !important; display: block !important;
      margin: 0 auto !important; transform: scale(0.95) !important;
    }
    @media (max-width: 768px) {
      .ad-banner iframe, .ad-banner ins {
        transform: scale(0.9) !important; transform-origin: center center !important;
      }
      html, body { overflow-x: hidden !important; position: relative; width: 100%; }
      .ad-banner { padding: 10px !important; margin: 10px 0 !important; border-radius: 6px !important; }
      .ad-sidebar { position: static !important; }
      .ad-content-scaler { transform-origin: center center !important; }
      #ad-above-iframe, #ad-below-iframe, #ad-page-bottom { padding: 8px !important; margin: 8px 0 !important; }
      .ad-banner > *, .ad-modern-wrapper > * { max-width: calc(100vw - 20px) !important; }
    }
    @media (max-width: 480px) {
      .ad-banner { padding: 6px !important; margin: 6px 0 !important; border-radius: 4px !important; }
      .ad-label { font-size: 8px; padding: 1px 4px; }
      #ad-sidebar, #ad-sidebar-extra { min-height: 250px !important; }
    }
    .ad-scaled { transition: transform 0.3s ease !important; }
    .ad-banner * { max-width: 100% !important; box-sizing: border-box !important; }
    ins.adsbygoogle, iframe[src*="ads"], div[id*="ad"], div[class*="ad"] {
      max-width: 100% !important; overflow: hidden !important;
    }
  `;
  document.head.appendChild(style);
  console.log('🎨 Ad layout stylesheet injected');
});
