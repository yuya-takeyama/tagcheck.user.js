// ==UserScript==
// // @name           tagcheck.user.js
// // @namespace      http://yuyat.jp/
// // @description    Alert if unclosed tag is detected.
// // @include        *
// // ==/UserScript==
(function (window) {
    "use strict";

    var document = window.document;

    console.info('Checking tags for ' + document.location.href);

    // remove inplanted script tag
    (function () {
        var scriptTag = document.body.lastChild;
        if (scriptTag.tagName === 'SCRIPT') {
            document.body.removeChild(scriptTag);
        }
    })();

    // Get html code by re-request
    var html = (function () {
        var ajax = (function () {
            try {
                return window.XMLHttpRequest ? new window.XMLHttpRequest()
                    : (window.ActiveXObject ? new window.ActiveXObject('Msxml2.XMLHTTP') : null);
            } catch (e) {
                return new window.ActiveXObject('Microsoft.XMLHTTP');
            }
        })();
        ajax.open("GET", document.location.href, false);
        ajax.send('');
        return ajax.responseText;
    })(),
        opened = {},
        closed = {},
        errors = [],
        // そもそも空要素のタグ
        EMPTYTAG = ['img', 'link', 'meta', 'br', 'hr', 'input',
                    'embed', 'area', 'base', 'basefont', 'bgsound',
                    'param', 'wbr'];

    EMPTYTAG.indexOf = EMPTYTAG.indexOf || function (str) {
        for (var i = 0, l = this.length; i < l; i++) {
            if (this[i] == str) {
                return i;
            }
        }
        return -1;
    };


    // 開いたまま閉じていないタグを検索する
    (function () {
        // 閉じタグの開始位置を返す
        var closure = function (html, index, tagName) {
            var closeRe = new RegExp("<(/)?" + tagName + "( [^>]*)?>", "igm");
            closeRe.lastIndex = index;
            var depth = 1;
            var r = null;
            while (r = closeRe.exec(html)) {
                if (r[1] == '/') {
                    if (--depth == 0) {
                        // すでに他の閉じタグになってる場合はfalse
                        return closed[r.index] ? false : {
                            head:r.index,
                            tail:r.index + r[0].length
                        };
                    }
                } else {
                    depth ++;
                }
            }
            return false;
        };
        var openPattern = /<([a-zA-Z1-9:]+)([^>]*)>/gm;
        var found = null;
        while(found = openPattern.exec(html)) {
            var head = found.index;
            var tail = head + found[0].length;
            var tagName = found[1].toLowerCase();
            var attr = found[2];

            if (EMPTYTAG.indexOf(tagName) >= 0 || (attr && attr.charAt(attr.length - 1) == '/')) {
                // 空要素タグ
                closed[head] = {
                    open: head, 
                    openTail: tail,
                    close: head, 
                    closeTail: tail,
                    tagName: tagName, 
                    attr: attr
                };
            } else {
                var cls = closure(html, tail, tagName);
                if (cls) {
                    opened[head] = closed[cls.head] = {
                        open: head, 
                        openTail: tail,
                        close: cls.head, 
                        closeTail: cls.tail,
                        tagName: tagName, 
                        attr: attr
                    };
                } else {
                    errors.push({
                        id: errors.length,
                        head:head, 
                        tail:tail, 
                        tagName: tagName, 
                        attr: attr, 
                        message: "タグが閉じていません"
                    });
                }
            }
            openPattern.lastIndex = tail;
        }
    })();

    // 開きタグがない閉じタグを検索する
    (function () {
        var closePattern = /<\/([a-zA-Z1-9:]+)>/gm;
        var found = null;
        while(found = closePattern.exec(html)) {
            var head = found.index;
            var tail = head + found[0].length;
            var tagName = found[1].toLowerCase();
            var attr = '';
            if (EMPTYTAG.indexOf(tagName) < 0) {
                if (!closed[found.index]) {
                    errors.push({
                        id: errors.length,
                        head:head,
                        tail:tail,
                        tagName: '/' + tagName,
                        attr: attr,
                        message: "開きタグがありません"
                    });
                }
            }
            closePattern.lastIndex = tail;
        }
    })();

    // 先に開いたタグが先に閉じているような箇所がないかチェックする
    (function () {
        var checked = [];
        for (var i in opened) {
            var cl = opened[i];
            for (var j = checked.length - 1; j >= 0; j--) {
                var ch = checked[j];
                if (ch.open < cl.open 
                    && cl.open < ch.close 
                    && ch.close < cl.close) {
                    // 親開く-子開く-親閉じる-子閉じるの順
                    errors.push({
                        id: errors.length,
                        head: ch.close,
                        tail: ch.closeTail,
                        tagName: '/' + ch.tagName,
                        attr: '',
                        message: '&lt;' + cl.tagName + cl.attr + '&gt;よりも先に閉じてしまっています'
                    });
                    errors.push({
                        id: errors.length,
                        head: cl.close,
                        tail: cl.closeTail,
                        tagName: '/' + cl.tagName,
                        attr: '',
                        message: '&lt;' + ch.tagName + ch.attr + '&gt;よりも後で閉じてしまっています'
                    });
                } else if (ch.close < cl.open) {
                    // 注目している地点ですでに閉じてるのはチェックから外す
                    checked.splice(j, 1);
                }
            }
            checked.push(cl);
        }
    })();


    // show sourcecode
    (function () {
        var sourceLine = 1;
        // make source code html
        var re = function (htmlCode) {
            return htmlCode.replace(/[<>&\r\n \t]/g, function (c) {
                switch(c) {
                case '<':
                    return '&lt;';
                case '>':
                    return '&gt;';
                case '&':
                    return '&amp;';
                case "\r":
                    return '';
                case "\n":
                    var cls = sourceLine % 2 == 0 ? 'e' : 'o';
                    return '</div>\n<div class="ln">' + (++sourceLine) 
                            + '</div><div class="' + cls + '">&nbsp;';
                case "\t":
                    return "&nbsp;&nbsp;&nbsp;&nbsp;";
                case " ":
                    return "&nbsp;";
                }
            });
        }
        var sourceCode = ['<div class="ln">1</div><div class="e">&nbsp;'];
        errors.sort(function (a, b) {
            return a.head - b.head;
        });
        var rular = 0;
        for (var i = 0, l = errors.length; i < l; i++) {
            var uc = errors[i];
            if (rular < uc.tail) {
                var head = re(html.substring(rular, uc.head));
                var tag = re(html.substring(uc.head, uc.tail));
                uc.lineNumber = sourceLine;
                rular = uc.tail;
            }
        }
        sourceCode.push(re(html.substring(rular)), '<br clear="all">');
    })();

    // show list
    (function () {
        for (var i = 0, l = errors.length; i < l; i++) {
            var uc = errors[i];
            console.warn('Line ' + uc.lineNumber + ': <' + uc.tagName + '>: ' + uc.message);
        }
    })();
})(this);
