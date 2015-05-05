(function () {
    'use strict';

    var videojs = window.videojs;
    var vjs = window.vjs;
    var console = window.console;

    var SUPPORTED_STORAGE_TYPES = ['sessionStorage', 'localStorage'];

    var feautureSupported = function (name) {
        try {
            return name in window && window[name] !== null;
        } catch(e) {
            return false;
        }
    };

    var nopStorage = function (initialValue) {
        var value = initialValue;
        return {
            get: function () {
                return value;
            },
            set: function (newValue) {
                value = newValue;
            }
        };
    };

    var toggleFunctions = function (component) {
        return component.extend({
            toggleState: function (state) {
                this.options_.disabled = !state;
                if (!state) {
                    this.removeClass('enabled');
                    this.addClass('disabled');
                } else {
                    this.addClass('enabled');
                    this.removeClass('disabled');
                }
            },
            init: function (player, options) {
                options = options || {};
                options.disabled = !!options.disabled;
                component.call(this, player, options);
                this.toggleState(!options.disabled);
            }
        });
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
        currentPlayer.trigger('quality_changed');
    };

    SourceListItem.prototype.onClick = function () {
        this.parentMenu_.choiceStorage.set(this.options_.label);
        this.parentMenu_.disableAutoQuality();
        this.selectSource();
        vjs.MenuItem.prototype.onClick.call(this);
    };

    var SwitchMenu = toggleFunctions(vjs.MenuButton);

    var SourceListMenu = SwitchMenu.extend({
        className: 'vjs-sources-menu',
        /** @constructor */
        init: function (player, choiceStorage, options) {
            this.choiceStorage = choiceStorage;
            SwitchMenu.call(this, player, options);
            var that = this;

            player.on('quality-up', function () {
                if (that.currentSourceItem_ !== null && that.currentSourceItem_.higher != null) {
                    that.currentSourceItem_.higher.selectSource();
                }
            });

            player.on('quality-down', function () {
                if (that.currentSourceItem_ !== null && that.currentSourceItem_.lower != null) {
                    that.currentSourceItem_.lower.selectSource();
                }
            });
        }
    });

    SourceListMenu.prototype.buttonText = '';

    SourceListMenu.prototype.updateLabel = function (newLabel) {
        if (this.currentSourceValue_) {
            this.currentSourceValue_.innerHTML = newLabel;
        }
    };

    SourceListMenu.prototype.createEl = function () {
        var el = SwitchMenu.prototype.createEl.call(this);

        this.currentSourceValue_ = vjs.createEl('div', {
            className: 'vjs-current-source-value',
            innerHTML: ''
        });

        el.appendChild(this.currentSourceValue_);

        return el;
    };

    SourceListMenu.prototype.disableAutoQuality = function () {
        if (this.options_.disabled) {
            this.toggleState(true);
            if (this.autoQualityButton != null) {
                this.autoQualityButton.toggleState(false);
            }
        }
    };

    SourceListMenu.prototype.onClick = function () {
        this.disableAutoQuality();
        SwitchMenu.prototype.onClick.call(this);
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
                    sourceListItem.higher = this.menuItems_[i - 1];
                    this.menuItems_[i - 1].lower = sourceListItem;
                }
                menu.addItem(sourceListItem);
            }
            this.menuItems_[sources.length - 1].next = this.menuItems_[0];
        } else {
            this.updateLabel('');
            this.addClass('vjs-no-sources');
            this.removeClass('vjs-has-sources');
        }

        if (this.autoQualityButton != null) {
            if (this.menuItems_.length < 2) {
                this.autoQualityButton.hide();
            } else {
                this.autoQualityButton.show();
                this.autoQualityButton.switchToHighestQuality();
            }
        }

        return menu;
    };

    var ButtonSwitch = toggleFunctions(vjs.Button);

    var AutoQualityButton = ButtonSwitch.extend({
        buttonText: 'Auto',
        /** @constructor */
        init: function (player, menuButton, qualityDetectionStorage, options) {
            options.menuButton = menuButton;
            menuButton.autoQualityButton = this;
            this.qualityDetectionStorage = qualityDetectionStorage;
            options.disabled = !this.qualityDetectionStorage.get();
            ButtonSwitch.call(this, player, options);
            if (menuButton.menuItems_.length < 2) {
                this.hide();
            } else {
                if (!options.disabled) {
                    this.switchToHighestQuality();
                }
            }
        }
    });

    AutoQualityButton.prototype.onClick = function () {
        this.options_.disabled = !this.options_.disabled;
        this.options_.menuButton.toggleState(this.options_.disabled);
        this.switchToHighestQuality();
        this.toggleState(!this.options_.disabled);
        this.qualityDetectionStorage.set(!this.options_.disabled);
        ButtonSwitch.prototype.onClick.call(this);
    };

    AutoQualityButton.prototype.switchToHighestQuality = function () {
        if (!this.options_.disabled) {
            var currentSourceItem = this.options_.menuButton.currentSourceItem_;
            if (currentSourceItem) {
                var highest = currentSourceItem;
                while(highest.higher != null) {
                    highest = highest.higher;
                }
                if (highest !== currentSourceItem) {
                    highest.selectSource();
                }
            }
            this.options_.menuButton.toggleState(false);
        }
    };

    AutoQualityButton.prototype.buildCSSClass = function () {
        return ButtonSwitch.prototype.buildCSSClass.call(this) + 'vjs-auto-quality-button';
    };

    var createStorage = function (storageType, key, defaultValue) {
        var storage = nopStorage(defaultValue);

        if (storageType != null) {
            if (typeof  storageType === 'string') {
                if (SUPPORTED_STORAGE_TYPES.indexOf(storageType !== -1) && feautureSupported(storageType)) {
                    storage.set = function (quality) {
                        window[storageType][key] = quality;
                    };
                    storage.get = function () {
                        return window[storageType][key];
                    };
                } else {
                    console.warn('Unsupported storage type: ', storageType);
                }
            } else {
                storage = storageType;
            }
        }
        return storage;
    };

    var dynamicSources = function (options) {
        //Plugin initialization
        var currentPlayer = this;

        var choiceStorage = createStorage(options.preferedQualityStorage, options.preferedQualityStorageKey || 'vjs.dynamic.sources.selected.quality');

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

        if (options.qualityDetection === true) {

            var qualityDetectionStorage = createStorage(options.qualityDetectionStateStorage, options.qualityDetectionStateKey || 'vjs.dynamic.quality.detection.enabled', false);

            var BANDWIDTH_DETECTION_TIME = options.bandwidthDetectionTime || 3000;
            var DETECTION_START_DELAY = options.bandwidthDetectionStartDelay || BANDWIDTH_DETECTION_TIME / 2;

            var autoQualityButton = new AutoQualityButton(currentPlayer, sourceListMenu, qualityDetectionStorage, {});
            currentPlayer.controlBar.addChild(autoQualityButton);

            var progressData = [];
            var firstTime = null;

            currentPlayer.played = function () {
                var played = currentPlayer.tech.el_.played;
                if (!played || !played.length) {
                    played = vjs.createTimeRange(0, 0);
                }
                return played;
            };

            var currentDetectionTime = BANDWIDTH_DETECTION_TIME;
            var measuringDisabled = true;
            var timer = null;
            var startDetection = function () {
                timer = setTimeout(function () {
                    measuringDisabled = false;
                }, DETECTION_START_DELAY);
            };
            var pauseDetection = function () {
                clearTimeout(timer);
                measuringDisabled = true;
                progressData = [];
            };

            var timingCalculate = function () {
                var currentTime = new Date().getTime();
                if (firstTime == null) {
                    firstTime = currentTime;
                }
                if (measuringDisabled === true) {
                    return;
                }
                var i;
                var bufferedObject = currentPlayer.buffered();
                var currentBuffered = 0;
                for(i = 0; i < bufferedObject.length; i++) {
                    currentBuffered += bufferedObject.end(i) - bufferedObject.start(i);
                }
                var playedObject = currentPlayer.played();
                var currentPlayed = 0;
                for(i = 0; i < playedObject.length; i++) {
                    currentPlayed += playedObject.end(i) - playedObject.start(i);
                }
                var statData = {time: currentTime, elapsed: currentTime - firstTime, buffered: currentBuffered, played: currentPlayed};
                progressData.push(statData);
                currentPlayer.trigger({'type': 'progressStat', data: statData});
                var arrayShifted = false;
                while((currentTime - progressData[0].time) > currentDetectionTime) {
                    arrayShifted = true;
                    progressData.shift();
                }
                if (autoQualityButton.options().disabled !== true && arrayShifted) {
                    var time = (currentTime - progressData[0].time);
                    var playedPercent = 1000 * (currentPlayed - progressData[0].played) / time;
                    var bufferedPercent = 1000 * (currentBuffered - progressData[0].buffered) / time;
                    if (playedPercent < 0.98) {
                        measuringDisabled = true;
                        currentPlayer.trigger('quality-down');
                        if (currentDetectionTime < 2 * BANDWIDTH_DETECTION_TIME) {
                            currentDetectionTime *= 1.3;
                        }
                    } else if (bufferedPercent > 2.7) {
                        if (currentDetectionTime > BANDWIDTH_DETECTION_TIME) {
                            currentDetectionTime *= 0.7;
                        }
                        measuringDisabled = true;
                        currentPlayer.trigger('quality-up');
                    }
                }
            };
            currentPlayer.on('loadedmetadata', startDetection);
            currentPlayer.on('quality_changed', pauseDetection);
            currentPlayer.on('seeked', startDetection);
            currentPlayer.on('seeking', pauseDetection);
            currentPlayer.on('progress', timingCalculate);
        }
    };

    videojs.plugin('dynamicSources', dynamicSources);

}());