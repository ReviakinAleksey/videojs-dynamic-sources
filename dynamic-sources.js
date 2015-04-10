(function () {
    'use strict';

    var videojs = window.videojs;
    var vjs = window.vjs;

    var SUPPORTED_STORAGE_TYPES = ['sessionStorage', 'localStorage'];

    var feautureSupported = function (name) {
        try {
            return name in window && window[name] !== null;
        } catch(e) {
            return false;
        }
    };

    var nopStorage = {
        get: function () {
            return null;
        },
        set: function () {
        }
    };

    var SourceListItem = vjs.MenuItem.extend({
        contentElType: 'button',
        /** @constructor */
        init: function (player, parentMenu, options) {
            this.parentMenu_ = parentMenu;
            this.sourceValue_ = options.sourceValue;

            // Modify options for parent MenuItem class's init.
            options.label = options.sourceName;
            options.selected = options.selected === true;

            vjs.MenuItem.call(this, player, options);
            if (options.selected) {
                this.selectSource();
            }
        }
    });
    SourceListItem.prototype.selected = function (selected) {
        this.options_.selected = selected;
        vjs.MenuItem.prototype.selected.call(this, selected);
    };

    SourceListItem.prototype.selectSource = function () {
        var currentPlayer = this.player();
        var newSource = this.sourceValue_;
        if (!this.options_.selected) {
            for(var i = 0; i < this.parentMenu_.menuItems_.length; i++) {
                var item = this.parentMenu_.menuItems_[i];
                if (item !== this) {
                    item.selected(false);
                }

            }
            this.selected(true);
            var curTime = currentPlayer.currentTime();
            var wasPaused = currentPlayer.paused();
            currentPlayer.pause();
            currentPlayer.src(newSource);
            currentPlayer.ready(function () {
                currentPlayer.currentTime(curTime);
                if (!wasPaused) {
                    currentPlayer.play();
                }
            });
        }
        if (!currentPlayer.src()) {
            currentPlayer.src(newSource);
        }
        this.parentMenu_.currentSourceItem_ = this;
        this.parentMenu_.updateLabel(this.options_.label);
    };

    SourceListItem.prototype.onClick = function () {
        this.parentMenu_.choiceStorage.set(this.options_.label);
        this.selectSource();
        vjs.MenuItem.prototype.onClick.call(this);
    };

    var SourceListMenu = vjs.MenuButton.extend({
        className: 'vjs-sources-menu',
        /** @constructor */
        init: function (player, choiceStorage, options) {
            this.choiceStorage = choiceStorage;
            vjs.MenuButton.call(this, player, options);
        }
    });

    SourceListMenu.prototype.buttonText = '';

    SourceListMenu.prototype.updateLabel = function (newLabel) {
        if (this.currentSourceValue_) {
            this.currentSourceValue_.innerHTML = newLabel;
        }
    };

    SourceListMenu.prototype.createEl = function () {
        var el = vjs.MenuButton.prototype.createEl.call(this);

        this.currentSourceValue_ = vjs.createEl('div', {
            className: 'vjs-current-source-value',
            innerHTML: ''
        });

        el.appendChild(this.currentSourceValue_);

        return el;
    };

    SourceListMenu.prototype.onClick = function () {
        vjs.MenuButton.prototype.onClick.call(this);
        if (this.currentSourceItem_ !== null) {
            this.choiceStorage.set(this.currentSourceItem_.next.options_.label);
            this.currentSourceItem_.next.selectSource();
        }
    };

    // Menu creation
    SourceListMenu.prototype.createMenu = function () {
        var currentPlayer = this.player();
        var menu = new vjs.Menu(currentPlayer);
        var sources = currentPlayer.options_.dynamicSources;
        //[{sourceName: '1080p', sourceValue: '123'}, {sourceName: '720p', sourceValue: '222'}];
        this.menuItems_ = [];

        if (sources && sources.length > 0) {
            this.addClass('vjs-has-sources');
            this.removeClass('vjs-no-sources');
            for(var i = 0; i < sources.length; i++) {
                var source = sources[i];
                var sourceListItem = new SourceListItem(currentPlayer, this, source);
                this.menuItems_.push(sourceListItem);
                if (i !== 0) {
                    this.menuItems_[i - 1].next = sourceListItem;
                }
                menu.addItem(sourceListItem);
            }
            this.menuItems_[sources.length - 1].next = this.menuItems_[0];
        } else {
            this.updateLabel('');
            this.addClass('vjs-no-sources');
            this.removeClass('vjs-has-sources');
        }

        return menu;
    };

    var dynamicSources = function (options) {
        //Plugin initialization
        var currentPlayer = this;

        var choiceStorage = nopStorage;
        var storageKey = options.preferedQualityStorageKey || 'vjs.dynamic.sources.selected.quality';

        if (options.preferedQualityStorage != null) {
            if (typeof  options.preferedQualityStorage === 'string') {
                if (SUPPORTED_STORAGE_TYPES.indexOf(options.preferedQualityStorage !== -1) && feautureSupported(options.preferedQualityStorage)) {
                    choiceStorage.set = function (quality) {
                        window[options.preferedQualityStorage][storageKey] = quality;
                    };
                    choiceStorage.get = function () {
                        return window[options.preferedQualityStorage][storageKey];
                    };
                } else {
                    console.warn('Unsupported storage type: ', options.preferedQualityStorage);
                }
            } else {
                choiceStorage = options.preferedQualityStorage;
            }
        }

        /*
         player.setSources([
         {
             'HD': [
                 {type: "video/mp4", src: "http://www.example.com/path/to/hd_video.mp4"},
                 {type: "video/webm", src: "http://www.example.com/path/to/hd_video.webm"},
                 {type: "video/ogg", src: "http://www.example.com/path/to/hd_video.ogv"}
                ],
              selected: true
          },
         {
             'SD': [
                 {type: "video/mp4", src: "http://www.example.com/path/to/sd_video.mp4"},
                 {type: "video/webm", src: "http://www.example.com/path/to/sd_video.webm"},
                 {type: "video/ogg", src: "http://www.example.com/path/to/sd_video.ogv"}
             ]
         },
         {
            'REGULAR' : 'http://www.example.com/path/to/fallback_video.ogv'
         }
         ]);

         */
        currentPlayer.setSources = function (src) {
            var i, sourceObject, sourceLabel, sourceDescriptor;
            var internalSources = [];
            if (Array.isArray(src)) {
                var preferedSourceName = choiceStorage.get();
                var selectedSourceFound = false;

                for(i = 0; i < src.length; i++) {
                    sourceObject = src[i];
                    sourceLabel = undefined;
                    for(var key in sourceObject) {
                        if (Object.prototype.hasOwnProperty.call(sourceObject, key) && key !== 'selected') {
                            sourceLabel = key;
                            break;
                        }
                    }
                    if (sourceLabel !== undefined) {
                        sourceDescriptor = {
                            sourceName: sourceLabel,
                            sourceValue: sourceObject[key],
                            selected: sourceObject.selected
                        };

                        if (preferedSourceName == null) {
                            if (selectedSourceFound) {
                                sourceDescriptor.selected = false;
                            }
                        } else {
                            sourceDescriptor.selected = sourceDescriptor.sourceName === preferedSourceName;
                        }
                        if (sourceDescriptor.selected === true) {
                            selectedSourceFound = true;
                        }
                        internalSources.push(sourceDescriptor);
                    }
                }
                if (selectedSourceFound === false && internalSources.length > 0) {
                    internalSources[0].selected = true;
                }
            } else {
                currentPlayer.src(src);
            }
            currentPlayer.options_.dynamicSources = internalSources;
            currentPlayer.trigger('dynamicSourcesUpdated');
        };

        if (options.sourceProvider != null) {
            var playFunction = currentPlayer.play;
            currentPlayer.play = function () {
                if (!currentPlayer.src()) {
                    options.sourceProvider(function (src) {
                        currentPlayer.setSources(src);
                        playFunction.call(currentPlayer);
                    });
                } else {
                    playFunction.call(currentPlayer);
                }
            };
            if (currentPlayer.autoplay()) {
                currentPlayer.play();
            }
        }

        var sourceListMenu = new SourceListMenu(currentPlayer, choiceStorage);
        sourceListMenu.on(currentPlayer, 'dynamicSourcesUpdated', sourceListMenu.update);

        currentPlayer.controlBar.addChild(sourceListMenu);
    };

    videojs.plugin('dynamicSources', dynamicSources);

}());