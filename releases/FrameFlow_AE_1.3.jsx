#target aftereffects
/* FrameFlow AE 1.3 | Standalone native ScriptUI panel. Independent implementation. */
(function (thisObj) {
/* FrameFlow AE 1.3. Pure ES3 timing and preference logic. */
var FFCore = (function () {
    function trim(v) { return String(v).replace(/^\s+|\s+$/g, ""); }
    function frames(v) {
        var s = trim(v), n;
        if (!/^\d+$/.test(s)) throw new Error("Кадры: введите положительное целое число.");
        n = Number(s);
        if (!isFinite(n) || n < 1 || n > 1000000) throw new Error("Кадры: допустимо от 1 до 1000000.");
        return n;
    }
    function decimal(v) {
        var s = trim(v).replace(",", "."), n;
        if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)) throw new Error("Диапазон: нужен номер кадра, например 24 или 24.5.");
        n = Number(s);
        if (!isFinite(n)) throw new Error("Диапазон: число вне допустимого предела.");
        return n;
    }
    function inRegion(t, r) {
        if (r.region === "before") return t < r.cti;
        if (r.region === "after") return t >= r.cti;
        if (r.region === "range") return t >= r.from && t < r.to;
        return true;
    }
    function offsetSeconds(c, r) {
        var d;
        if (r.direction !== 1 && r.direction !== -1) throw new Error("Не задано направление");
        if (typeof r.deltaSeconds !== "undefined") {
            d = r.deltaSeconds;
            if (typeof d !== "number" || !isFinite(d) || d === 0 || Math.abs(d) > 10800 || d * r.direction <= 0) throw new Error("Некорректный интервал сдвига");
            return d;
        }
        return frames(r.frames) * c.frameDuration * r.direction;
    }
    function gapPlan(layers, c) {
        var a = 0, b = null, i, l, d, eps = c.frameDuration * 0.000001;
        function no(why) { return {ok:false,reason:why}; }
        if (!isFinite(c.cti) || c.cti < 0 || c.cti >= c.duration || !(c.frameDuration > 0)) return no("Курсор должен быть внутри композиции");
        if (!layers.length) return no("В выбранной области нет слоёв");
        for (i = 0; i < layers.length; i++) {
            l = layers[i];
            if (!isFinite(l.inPoint) || !isFinite(l.outPoint) || l.inPoint >= l.outPoint) return no("У слоя некорректные границы времени");
            if (l.inPoint <= c.cti && l.outPoint > c.cti) return no("Курсор находится на слое; пустого промежутка нет");
            if (l.outPoint <= c.cti && l.outPoint > a) a = l.outPoint;
            if (l.inPoint > c.cti && (b === null || l.inPoint < b)) b = l.inPoint;
        }
        if (b === null || b >= c.duration) return no("После курсора нет следующего слоя внутри композиции");
        d = b-a;
        if (d <= eps) return no("Между слоями нет паузы");
        for (i = 0; i < layers.length; i++) if (layers[i].inPoint >= b && layers[i].locked) return no("После паузы есть заблокированный слой (Locked)");
        return {ok:true,start:a,end:b,duration:d,frames:d/c.frameDuration};
    }
    function parsePanelState(raw) {
        var result = {settings:{frames:1,scope:"auto",compMarkers:false},storageProtected:false,note:""}, parts, pair, seen = {}, i;
        if (raw === null || typeof raw === "undefined" || raw === "") return result;
        try {
            parts = String(raw).split("|"); if (parts[0] !== "v1") throw new Error("Версия");
            for (i = 1; i < parts.length; i++) {
                pair = parts[i].split("=");
                if (pair.length !== 2 || seen["k:"+pair[0]]) throw new Error("Формат");
                seen["k:"+pair[0]] = true;
                if (pair[0] === "frames") result.settings.frames = frames(pair[1]);
                else if (pair[0] === "scope") {
                    if (pair[1] !== "auto" && pair[1] !== "all" && pair[1] !== "selected") throw new Error("Область");
                    result.settings.scope = pair[1];
                } else if (pair[0] === "compMarkers") {
                    if (pair[1] !== "0" && pair[1] !== "1") throw new Error("Маркеры");
                    result.settings.compMarkers = pair[1] === "1";
                } else throw new Error("Неизвестное поле");
            }
        } catch (e) {
            result.settings = {frames:1,scope:"auto",compMarkers:false}; result.storageProtected = true;
            result.note = "Сохранённые параметры панели не распознаны и оставлены без изменений. Значения действуют в этой сессии.";
        }
        return result;
    }
    function encodePanelState(s) {
        if (s.scope !== "auto" && s.scope !== "all" && s.scope !== "selected") throw new Error("Неизвестная область");
        return "v1|frames="+frames(s.frames)+"|scope="+s.scope+"|compMarkers="+(s.compMarkers ? "1" : "0");
    }
    function offsetLayerPlan(m, c, r) {
        var d = offsetSeconds(c,r), kind = "none", a = m.inPoint, b = m.outPoint, st = m.start;
        if (r.direction !== 1 && r.direction !== -1) throw new Error("Не задано направление");
        if (r.region !== "before" && r.region !== "after") throw new Error("Выберите сторону курсора");
        if (m.locked) return {skip:"Locked layer"};
        if (r.region === "before") {
            if (b <= c.cti) kind = "layer";
            else if (a < c.cti) kind = "edge";
        } else {
            if (a >= c.cti) kind = "layer";
            else if (b > c.cti) kind = "edge";
        }
        if (kind === "layer") { st += d; a += d; b += d; }
        else if (kind === "edge") { if (r.region === "before") a += d; else b += d; }
        if (kind !== "none" && (a >= b || b - a < c.frameDuration * 0.000001)) return {skip:"Сдвиг обнулит или перевернёт длительность слоя"};
        if (Math.abs(st) > 10800 || Math.abs(a) > 10800 || Math.abs(b) > 10800) return {skip:"Границы слоя выйдут за диапазон AE ±10800 s"};
        return {kind:kind,delta:d,start:st,inPoint:a,outPoint:b};
    }
    function keyPlan(keys, c, r, selectedOnly) {
        var times = [], i, moved = 0, d = offsetSeconds(c,r);
        var filter = {region:r.region, cti:c.cti, from:r.from, to:r.to};
        var roving = false, epsilon = c.frameDuration * 0.000001;
        for (i = 0; i < keys.length; i++) {
            times[i] = keys[i].time;
            if ((!selectedOnly || keys[i].selected) && inRegion(keys[i].time, filter)) {
                times[i] += d;
                moved++;
            }
            if (keys[i].roving) roving = true;
        }
        if (moved === 0) return {times:times, moved:0};
        if (moved !== keys.length && roving) return {times:times, moved:0, skip:"Roving: требуется равномерный перенос всех ключей свойства"};
        for (i = 0; i < times.length; i++) {
            if (!isFinite(times[i]) || Math.abs(times[i]) > 10800) return {error:"Время ключа вне границ AE",moved:0};
            if (i > 0 && Math.abs(times[i] - times[i-1]) <= epsilon) return {error:"Коллизия ключей: операция заблокирована",moved:0};
            if (i > 0 && times[i] < times[i-1]) return {error:"Меняется порядок ключей: операция заблокирована",moved:0};
        }
        return {times:times, moved:moved};
    }
    function favorites(v) {
        var parts = trim(v).split(","), out = [], i, j, n, found;
        if (parts.length > 8) throw new Error("Избранное: максимум 8 значений.");
        for (i = 0; i < parts.length; i++) {
            n = frames(parts[i]); found = false;
            for (j = 0; j < out.length; j++) if (out[j] === n) found = true;
            if (!found) out.push(n);
        }
        return out;
    }
    function defaults() { return {density:0, spacing:6, logging:false, favorites:[1,5,12,24]}; }
    function parseSettings(raw) {
        var result = {settings:defaults(), storageProtected:false, note:""}, parts, i, pair, n;
        if (raw === null || typeof raw === "undefined" || raw === "") return result;
        parts = String(raw).split("|");
        if (parts[0] !== "v1") {
            result.storageProtected = true; result.note = "Неизвестная версия настроек сохранена. Новые настройки действуют только в этой сессии."; return result;
        }
        try {
            for (i = 1; i < parts.length; i++) {
                pair = parts[i].split("=");
                if (pair.length !== 2) throw new Error("Повреждённый формат");
                if (pair[0] === "density") {
                    n = Number(pair[1]); if (!/^[01]$/.test(pair[1])) throw new Error("density"); result.settings.density = n;
                } else if (pair[0] === "spacing") {
                    n = Number(pair[1]); if (!/^\d+$/.test(pair[1]) || n < 3 || n > 16) throw new Error("spacing"); result.settings.spacing = n;
                } else if (pair[0] === "logging") {
                    if (!/^[01]$/.test(pair[1])) throw new Error("logging"); result.settings.logging = pair[1] === "1";
                } else if (pair[0] === "favorites") result.settings.favorites = favorites(pair[1]);
                else throw new Error("Неизвестный параметр");
            }
        } catch (e) {
            result.settings = defaults(); result.storageProtected = true;
            result.note = "Повреждённые настройки сохранены. Используются сессионные значения по умолчанию.";
        }
        return result;
    }
    function encodeSettings(s) {
        return "v1|density=" + s.density + "|spacing=" + s.spacing + "|logging=" + (s.logging ? "1" : "0") + "|favorites=" + s.favorites.join(",");
    }
    return {offsetSeconds:offsetSeconds,gapPlan:gapPlan,parsePanelState:parsePanelState,encodePanelState:encodePanelState,parseFrames:frames, parseDecimal:decimal, inRegion:inRegion, offsetLayerPlan:offsetLayerPlan, keyPlan:keyPlan,
        parseFavorites:favorites, defaults:defaults, parseSettings:parseSettings, encodeSettings:encodeSettings};
}());

/* FrameFlow AE 1.3. AE adapter; native values never pass through JSON. */
var FFHost = (function () {
    var LIMITS = {properties:20000, keys:50000, reportLines:300, textCharacters:2000};
    var ROOTS = ["ADBE Transform Group", "ADBE Mask Parade", "ADBE Effect Parade", "ADBE MTrackers",
        "ADBE Audio Group", "ADBE Text Properties", "ADBE Root Vectors Group", "ADBE Layer Styles",
        "ADBE Material Options Group", "ADBE Extrsn Options Group", "ADBE Plane Options Group",
        "ADBE Camera Options Group", "ADBE Light Options Group", "ADBE Layer Overrides",
        "ADBE Time Remapping", "ADBE Marker"];
    function copy(v) {
        var a, i;
        if (v && typeof v === "object" && typeof v.length === "number") {
            a = []; for (i = 0; i < v.length; i++) a[i] = copy(v[i]); return a;
        }
        return v;
    }
    function equal(a, b, tolerance) {
        var i, k, countA = 0, countB = 0;
        if (typeof a === "number" && typeof b === "number") return Math.abs(a-b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
        if (a === b) return true;
        if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
        if (typeof a.length === "number" || typeof b.length === "number") {
            if (a.length !== b.length) return false;
            for (i = 0; i < a.length; i++) if (!equal(a[i],b[i],tolerance)) return false;
            return true;
        }
        for (k in a) if (a.hasOwnProperty(k)) { countA++; if (!b.hasOwnProperty(k) || !equal(a[k], b[k], tolerance)) return false; }
        for (k in b) if (b.hasOwnProperty(k)) countB++;
        return countA === countB;
    }
    function readableTextFields(value, fallback) {
        var out = {}, names = {}, i, name, v, reflected;
        function simple(a) {
            var j, t = typeof a;
            if (a === null || t === "string" || t === "boolean" || t === "number") return true;
            if (a && t === "object" && typeof a.length === "number") {
                for (j = 0; j < a.length; j++) if (!simple(a[j])) return false;
                return true;
            }
            return false;
        }
        for (i = 0; i < fallback.length; i++) names[fallback[i]] = true;
        /* Reflection is documented ExtendScript; include readable new attributes rather than a frozen subset. */
        try {
            reflected = value.reflect.properties;
            for (i = 0; i < reflected.length; i++) names[String(reflected[i].name)] = true;
        } catch (noReflection) { }
        for (name in value) names[name] = true;
        for (name in names) if (names.hasOwnProperty(name) && name !== "reflect" && name !== "__proto__") {
            try {
                v = value[name];
                if (typeof v === "undefined") out[name] = {state:"undefined"};
                else if (simple(v)) out[name] = {state:"value",value:copy(v)};
                else if (typeof v !== "function") {
                    /* Enumerators are immutable native values; keep their stable text identity. */
                    if (typeof v === "object" && typeof v.reflect !== "undefined" && String(v.reflect.name) === "Enumerator") out[name] = {state:"enum",value:String(v)};
                }
            } catch (unreadable) { out[name] = {state:"unreadable"}; }
        }
        return out;
    }
    function signature(v, type) {
        var s = {}, fields, i, name;
        if (type === PropertyValueType.SHAPE) {
            fields = ["closed","vertices","inTangents","outTangents","featherSegLocs","featherRelSegLocs","featherRadii",
                "featherInterps","featherTensions","featherTypes","featherRelCornerAngles"];
        } else if (type === PropertyValueType.TEXT_DOCUMENT) {
            fields = ["text","font","fontSize","applyFill","applyStroke","fillColor","strokeColor","strokeWidth",
                "strokeOverFill","justification","tracking","leading","autoLeading","baselineShift","horizontalScale",
                "verticalScale","fauxBold","fauxItalic","allCaps","smallCaps","superscript","subscript",
                "boxText","boxTextSize","boxTextPos","pointText"];
        } else if (type === PropertyValueType.MARKER) {
            fields = ["comment","chapter","url","frameTarget","cuePointName","duration","eventCuePoint","label","protectedRegion"];
        } else return copy(v);
        for (i = 0; i < fields.length; i++) {
            name = fields[i];
            try { if (typeof v[name] !== "undefined") s[name] = copy(v[name]); } catch (ignored) { /* conditional native attribute */ }
        }
        if (type === PropertyValueType.TEXT_DOCUMENT) {
            if (typeof v.characterRange !== "function") throw new Error("Source Text: требуется CharacterRange для проверки форматирования");
            if (v.text.length > LIMITS.textCharacters) throw new Error("Source Text: более 2000 символов в ключе; свойство исключено для ограниченной стоимости проверки");
            s.document = readableTextFields(v,fields);
            s.characters = [];
            for (i = 0; i < v.text.length; i++) s.characters.push(readableTextFields(v.characterRange(i,i+1),fields));
            s.paragraphs = [];
            if (typeof v.paragraphCount === "number" && v.paragraphCount > 1) {
                if (typeof v.paragraphRange !== "function") throw new Error("Source Text: требуется ParagraphRange для проверки абзацев");
                for (i = 0; i < v.paragraphCount; i++) s.paragraphs.push(readableTextFields(v.paragraphRange(i,i+1),fields));
            }
        }
        if (type === PropertyValueType.MARKER) s.parameters = copyParameters(v.getParameters());
        return s;
    }
    function copyParameters(v) {
        var s = {}, k; for (k in v) if (v.hasOwnProperty(k)) s[k] = v[k]; return s;
    }
    function easeList(a) {
        var b = [], i; for (i = 0; i < a.length; i++) b.push({speed:a[i].speed, influence:a[i].influence}); return b;
    }
    function nativeEase(a) {
        var b = [], i; for (i = 0; i < a.length; i++) b.push(new KeyframeEase(a[i].speed,a[i].influence)); return b;
    }
    function sourceState(p) {
        if (!p.canSetExpression) return {text:"", enabled:false};
        return {text:p.expression, enabled:p.expressionEnabled};
    }
    function snapshotProperty(p) {
        var s = {type:p.propertyValueType, spatial:p.isSpatial === true, marker:p.propertyValueType === PropertyValueType.MARKER,
            expression:sourceState(p), keys:[], hasLabels:false}, k, v, i, easeCount;
        s.hasLabels = !s.marker && typeof p.keyLabel === "function" && typeof p.setLabelAtKey === "function";
        for (i = 1; i <= p.numKeys; i++) {
            v = p.keyValue(i);
            k = {time:p.keyTime(i), value:copy(v), signature:signature(v,s.type), selected:p.keySelected(i)};
            if (!s.marker) {
                k.inType = p.keyInInterpolationType(i); k.outType = p.keyOutInterpolationType(i);
                k.inEase = easeList(p.keyInTemporalEase(i)); k.outEase = easeList(p.keyOutTemporalEase(i));
                easeCount = s.type === PropertyValueType.TwoD ? 2 : (s.type === PropertyValueType.ThreeD ? 3 : 1);
                if (k.inEase.length !== easeCount || k.outEase.length !== easeCount) throw new Error("Неожиданная размерность Temporal Ease");
                k.temporalAuto = p.keyTemporalAutoBezier(i); k.temporalContinuous = p.keyTemporalContinuous(i);
                if (s.hasLabels) k.label = p.keyLabel(i);
                if (s.spatial) {
                    k.inTangent = copy(p.keyInSpatialTangent(i)); k.outTangent = copy(p.keyOutSpatialTangent(i));
                    k.spatialAuto = p.keySpatialAutoBezier(i); k.spatialContinuous = p.keySpatialContinuous(i); k.roving = p.keyRoving(i);
                }
            }
            s.keys.push(k);
        }
        return s;
    }
    function remapAnchor(p, times) {
        var all = [], i, high, low, gap = 0, anchor;
        for (i = 1; i <= p.numKeys; i++) all.push(p.keyTime(i));
        for (i = 0; i < times.length; i++) all.push(times[i]);
        if (!all.length) throw new Error("Time Remap: нет ключа для безопасной записи");
        all.sort(function (a,b) { return a-b; }); low = all[0]; high = all[all.length-1];
        if (high + 1 <= 10800) return high + 1;
        if (low - 1 >= -10800) return low - 1;
        for (i = 1; i < all.length; i++) if (all[i]-all[i-1] > gap) { gap = all[i]-all[i-1]; anchor = (all[i]+all[i-1])/2; }
        if (gap < 0.001) throw new Error("Time Remap: нет свободного времени для временного ключа");
        return anchor;
    }
    function restoreExpressionState(p, s) {
        if (!p.canSetExpression || !s.expression) return;
        if (p.expression !== s.expression.text) throw new Error("Текст Expression изменился вне операции");
        if (p.expressionEnabled !== s.expression.enabled) p.expressionEnabled = s.expression.enabled;
    }
    function restoreProperty(p, s, times) {
        var i, k, anchor, remap = p.matchName === "ADBE Time Remapping";
        /* Removing the last Time Remap key can disable its host property. Keep a temporary key throughout writing. */
        if (remap) {
            anchor = remapAnchor(p,times);
            p.setValueAtTime(anchor,s.keys[0].value);
        }
        for (i = p.numKeys; i >= 1; i--) if (!remap || Math.abs(p.keyTime(i)-anchor) > 0.000001) p.removeKey(i);
        for (i = 0; i < s.keys.length; i++) p.setValueAtTime(times[i],s.keys[i].value);
        if (remap) {
            for (i = p.numKeys; i >= 1; i--) if (Math.abs(p.keyTime(i)-anchor) <= 0.000001) { p.removeKey(i); break; }
        }
        if (p.numKeys !== s.keys.length) throw new Error("AE объединил ключи при записи");
        for (i = 0; i < s.keys.length; i++) {
            k = s.keys[i];
            if (!s.marker) {
                p.setInterpolationTypeAtKey(i+1,k.inType,k.outType);
                p.setTemporalAutoBezierAtKey(i+1,false); p.setTemporalContinuousAtKey(i+1,false);
                if (k.inType === KeyframeInterpolationType.BEZIER || k.outType === KeyframeInterpolationType.BEZIER) {
                    p.setTemporalEaseAtKey(i+1,nativeEase(k.inEase),nativeEase(k.outEase));
                }
                p.setInterpolationTypeAtKey(i+1,k.inType,k.outType);
                p.setTemporalContinuousAtKey(i+1,k.temporalContinuous);
                p.setTemporalAutoBezierAtKey(i+1,k.temporalAuto);
                if (s.spatial) {
                    p.setRovingAtKey(i+1,false); p.setSpatialAutoBezierAtKey(i+1,false); p.setSpatialContinuousAtKey(i+1,false);
                    p.setSpatialTangentsAtKey(i+1,k.inTangent,k.outTangent);
                    p.setSpatialContinuousAtKey(i+1,k.spatialContinuous); p.setSpatialAutoBezierAtKey(i+1,k.spatialAuto);
                }
                if (s.hasLabels) p.setLabelAtKey(i+1,k.label);
            }
        }
        /* Roving only after all values/tangents/endpoints exist. */
        if (s.spatial) for (i = 0; i < s.keys.length; i++) if (s.keys[i].roving) p.setRovingAtKey(i+1,true);
        for (i = 0; i < s.keys.length; i++) p.setSelectedAtKey(i+1,s.keys[i].selected);
        restoreExpressionState(p,s);
    }
    function verifyProperty(p, s, times, timeTolerance) {
        var now = snapshotProperty(p), i, k, actual, field, names;
        if (now.type !== s.type || now.keys.length !== s.keys.length) throw new Error("Изменились тип или число ключей");
        if (!equal(now.expression,s.expression,0)) throw new Error("Изменился Expression");
        for (i = 0; i < s.keys.length; i++) {
            k = s.keys[i]; actual = now.keys[i];
            if (Math.abs(actual.time-times[i]) > timeTolerance) throw new Error("Время ключа " + (i+1) + " не совпадает с расчётом");
            if (!equal(k.signature,actual.signature,0.000001)) throw new Error("Значение ключа " + (i+1) + " не сохранилось");
            names = ["selected"];
            if (!s.marker) {
                if (actual.inType !== k.inType || actual.outType !== k.outType) throw new Error("Interpolation ключа " + (i+1) + " не сохранилась");
                names = names.concat(["temporalAuto","temporalContinuous"]);
                if (!k.temporalAuto && (k.inType === KeyframeInterpolationType.BEZIER || k.outType === KeyframeInterpolationType.BEZIER)) names = names.concat(["inEase","outEase"]);
                if (s.hasLabels) names.push("label");
                if (s.spatial) names = names.concat(["inTangent","outTangent","spatialAuto","spatialContinuous","roving"]);
            }
            for (field = 0; field < names.length; field++) if (!equal(k[names[field]],actual[names[field]],0.000001)) {
                throw new Error(names[field] + " ключа " + (i+1) + " не сохранилось");
            }
        }
    }
    function originalTimes(s) { var a = [], i; for (i = 0; i < s.keys.length; i++) a.push(s.keys[i].time); return a; }
    function pathOf(p, layer) {
        var path = [], n = p, steps = 0;
        while (n && n !== layer && steps < 40) {
            path.unshift({index:n.propertyIndex, match:n.matchName}); n = n.propertyGroup(1); steps++;
        }
        if (n !== layer) throw new Error("Не удалось определить путь свойства");
        return path;
    }
    function pathKey(path) {
        var a = [], i; for (i = 0; i < path.length; i++) a.push(path[i].index + ":" + path[i].match); return a.join("/");
    }
    function resolve(layer, path) {
        var node = layer, next, i;
        for (i = 0; i < path.length; i++) {
            next = null;
            try { next = node.property(path[i].index); } catch (ignored) { }
            if (!next || next.matchName !== path[i].match) next = node.property(path[i].match);
            if (!next || next.matchName !== path[i].match) throw new Error("Свойство недоступно: " + path[i].match);
            node = next;
        }
        return node;
    }
    function scanLayer(layer) {
        var out = [], seen = {}, visited = 0, i, root;
        function walk(node, depth) {
            var key, j;
            if (!node) return;
            visited++; if (visited > LIMITS.properties || depth > 40) throw new Error("Слишком большой набор свойств; сузьте область.");
            if (node.propertyType === PropertyType.PROPERTY) {
                key = pathKey(pathOf(node,layer));
                if (!seen["p:"+key]) { seen["p:"+key] = true; out.push(node); }
                return;
            }
            for (j = 1; j <= node.numProperties; j++) walk(node.property(j),depth+1);
        }
        for (i = 1; i <= layer.numProperties; i++) walk(layer.property(i),0);
        for (i = 0; i < ROOTS.length; i++) {
            root = null; try { root = layer.property(ROOTS[i]); } catch (ignored) { }
            if (root) walk(root,0);
        }
        /* Selected properties include user/plugin groups not in the common root catalogue. */
        for (i = 0; i < layer.selectedProperties.length; i++) walk(layer.selectedProperties[i],0);
        return out;
    }
    function allowedType(t) {
        return t === PropertyValueType.OneD || t === PropertyValueType.TwoD || t === PropertyValueType.ThreeD ||
            t === PropertyValueType.TwoD_SPATIAL || t === PropertyValueType.ThreeD_SPATIAL || t === PropertyValueType.COLOR ||
            t === PropertyValueType.LAYER_INDEX || t === PropertyValueType.MASK_INDEX || t === PropertyValueType.SHAPE || t === PropertyValueType.TEXT_DOCUMENT;
    }
    function labelFor(layer, path) {
        return "Layer #" + layer.index + " (id " + layer.id + ") / " + (path.length ? path[path.length-1].match : "слой");
    }
    function errorInfo(e) {
        var info = {message:String(e && e.message ? e.message : e)};
        try { if (e.line) info.line = e.line; } catch (ignored1) { }
        try { if (e.fileName) info.file = String(e.fileName).replace(/^.*[\\\/]/, ""); } catch (ignored2) { }
        try { if (e.stack) info.stack = String(e.stack).substring(0,2000); } catch (ignored3) { }
        return info;
    }
    function readContext() {
        var comp = app.project ? app.project.activeItem : null;
        if (!(comp instanceof CompItem)) throw new Error("Откройте композицию в AE.");
        return {comp:comp, cti:comp.time, duration:comp.duration, frameDuration:comp.frameDuration};
    }
    function captureNative(p) {
        var s = {nativeOnly:true,keys:[],expression:null}, i;
        if (p.canSetExpression) s.expression = {text:p.expression,enabled:p.expressionEnabled};
        for (i = 1; i <= p.numKeys; i++) s.keys.push({time:p.keyTime(i),selected:p.keySelected(i)});
        return s;
    }
    function verifyNative(p, s, times, tolerance) {
        var i;
        if (p.numKeys !== s.keys.length) throw new Error("Изменилось число нативных ключей");
        if (s.expression && (p.expression !== s.expression.text || p.expressionEnabled !== s.expression.enabled)) throw new Error("Изменился Expression");
        for (i = 0; i < times.length; i++) {
            if (Math.abs(p.keyTime(i+1)-times[i]) > tolerance || p.keySelected(i+1) !== s.keys[i].selected) throw new Error("Нативный перенос ключей не совпал с расчётом");
        }
    }
    function selectedLayers(comp, scope) {
        var layers = [], i;
        if (scope !== "auto" && scope !== "all" && scope !== "selected") throw new Error("Неизвестная область");
        if (scope === "all" || (scope === "auto" && !comp.selectedLayers.length)) {
            for (i = 1; i <= comp.numLayers; i++) layers.push(comp.layer(i));
        } else layers = comp.selectedLayers;
        if (!layers.length && scope === "selected") throw new Error("Выделите слои или выберите Авто / Всю композицию.");
        return layers;
    }
    function inspectGap(scope) {
        var context = readContext(), layers = selectedLayers(context.comp,scope), models = [], i, l;
        for (i = 0; i < layers.length; i++) {
            l = layers[i]; models.push({inPoint:l.inPoint,outPoint:l.outPoint,locked:l.locked,start:l.startTime});
        }
        return {context:context,layers:layers,models:models,gap:FFCore.gapPlan(models,context)};
    }
    function prepareGap(options) {
        var inspected = inspectGap(options.scope), gap = inspected.gap, p, t, duration, i, plan;
        if (!gap.ok) throw new Error(gap.reason);
        if (options.compMarkers && inspected.context.comp.markerProperty) {
            p = inspected.context.comp.markerProperty;
            for (i = 1; i <= p.numKeys; i++) {
                t = p.keyTime(i); duration = p.keyValue(i).duration;
                if ((t >= gap.start && t < gap.end) || (t < gap.end && t+duration > gap.start)) throw new Error("В удаляемой паузе есть маркер композиции. Отключите их перенос или измените маркеры.");
            }
        }
        plan = prepare({scope:options.scope,compMarkers:options.compMarkers === true,operation:"closeGap",frames:1,
            direction:-1,region:"after",deltaSeconds:-gap.duration,gap:gap,originalCTI:inspected.context.cti});
        plan.gapScope = inspected.layers; plan.gapModels = inspected.models;
        if (plan.skips.length) plan.errors.push("Пауза не удалена: не все цели доступны. Причины — в пропусках.");
        if (!plan.changes.length) plan.errors.push("После паузы нет доступных целей.");
        return plan;
    }
    function validateGapPlan(plan) {
        var now = inspectGap(plan.request.scope), i, a, b, eps = plan.context.frameDuration * 0.000001;
        if (now.context.comp !== plan.comp || Math.abs(now.context.cti-plan.request.originalCTI) > eps || now.layers.length !== plan.gapScope.length) throw new Error("Курсор или область паузы изменились; повторите действие");
        for (i = 0; i < now.layers.length; i++) {
            a = now.models[i]; b = plan.gapModels[i];
            if (now.layers[i] !== plan.gapScope[i] || a.locked !== b.locked || Math.abs(a.start-b.start) > eps || Math.abs(a.inPoint-b.inPoint) > eps || Math.abs(a.outPoint-b.outPoint) > eps) throw new Error("Слои около паузы изменились; повторите действие");
        }
    }
    function mediaBoundaryLimit(layer, after, context) {
        var source, duration, stretch, start, end, eps = context.frameDuration * 0.000001, limit = null;
        try {
            /* This rule concerns native finite footage only. Stills, precomps and remapped layers keep their existing behavior. */
            if (layer.timeRemapEnabled !== false) return null;
            source = layer.source;
            if (!source || !source.mainSource || source.mainSource.isStill !== false) return null;
            duration = source.duration; stretch = layer.stretch;
            if (typeof duration !== "number" || !isFinite(duration) || duration <= 0 || typeof stretch !== "number" || !isFinite(stretch) || stretch <= 0) return null;
            start = layer.startTime; end = start+duration*stretch/100;
            if (after.outPoint > layer.outPoint+eps && after.outPoint > end+eps) {
                limit = {field:"Out",requested:after.outPoint,available:end};
                limit.message = "Предел исходного медиа: Out запрошен "+after.outPoint+" s, доступен до "+end+" s. Весь слой пропущен.";
            } else if (after.inPoint < layer.inPoint-eps && after.inPoint < start-eps) {
                limit = {field:"In",requested:after.inPoint,available:start};
                limit.message = "Предел исходного медиа: In запрошен "+after.inPoint+" s, доступен от "+start+" s. Весь слой пропущен.";
            }
            if (limit) { limit.layerIndex = layer.index; limit.layerId = layer.id; limit.sourceDuration = duration; limit.stretch = stretch; }
        } catch (unavailableMediaMetadata) { return null; }
        return limit;
    }
    function prepare(request) {
        var context = readContext(), comp = context.comp, layers = [], i, j, k, layer, props, p, path, s, kp, lp, count = 0;
        var plan = {comp:comp,context:context,request:request,changes:[],skips:[],errors:[],notes:[],layerCount:0,mediaLimits:[]};
        FFCore.offsetSeconds(context,request);
        if (request.direction !== 1 && request.direction !== -1) throw new Error("Не задано направление");
        if (request.region !== "before" && request.region !== "after") throw new Error("Не задана сторона курсора");
        if (request.scope !== "auto" && request.scope !== "all" && request.scope !== "selected") throw new Error("Неизвестная область");
        layers = selectedLayers(comp,request.scope);
        plan.layerCount = layers.length;
        if (request.operation === "closeGap") context.cti = request.gap.end;
        function addCount(n) { count += n; if (count > LIMITS.keys) throw new Error("Более 50000 ключей: сузьте область."); }
        function relevant(prop) {
            var q;
            for (q = 1; q <= prop.numKeys; q++) if (FFCore.inRegion(prop.keyTime(q),{region:request.region,cti:context.cti})) return true;
            return false;
        }
        function partial(prop) {
            var snap = snapshotProperty(prop), info;
            addCount(snap.keys.length);
            if (snap.marker) for (var m = 0; m < snap.keys.length; m++) {
                if (snap.keys[m].value.protectedRegion && FFCore.inRegion(snap.keys[m].time,{region:request.region,cti:context.cti})) throw new Error("Protected Region: перенос этой части слоя пропущен");
            }
            info = FFCore.keyPlan(snap.keys,context,request,false);
            if (info.error) { plan.errors.push("Layer #"+(layer ? layer.index : "comp")+": "+info.error); throw new Error(info.error); }
            if (info.skip) throw new Error(info.skip);
            return {snapshot:snap,times:info.times,moved:info.moved};
        }
        for (i = 0; i < layers.length; i++) {
            layer = layers[i];
            if (request.operation === "closeGap" && layer.inPoint < context.cti) continue;
            lp = FFCore.offsetLayerPlan({start:layer.startTime,inPoint:layer.inPoint,outPoint:layer.outPoint,locked:layer.locked},context,request);
            if (lp.skip) { plan.skips.push(labelFor(layer,[])+": "+lp.skip); continue; }
            if (lp.kind === "none") continue;
            if (lp.kind === "edge") {
                var mediaLimit = mediaBoundaryLimit(layer,lp,context);
                if (mediaLimit) {
                    plan.mediaLimits.push(mediaLimit); plan.skips.push(labelFor(layer,[])+": "+mediaLimit.message); continue;
                }
            }
            var entries = [], failed = "", moved = 0;
            try {
                props = scanLayer(layer);
                for (j = 0; j < props.length; j++) {
                    p = props[j]; if (!p.numKeys) continue;
                    path = pathOf(p,layer);
                    if (lp.kind === "layer") {
                        /* Native startTime moves even custom/plugin keys without reconstructing their values. */
                        try { s = snapshotProperty(p); } catch (unreadableValue) { s = captureNative(p); }
                        addCount(s.keys.length); kp = {snapshot:s,times:originalTimes(s),moved:s.keys.length};
                        for (k = 0; k < kp.times.length; k++) {
                            kp.times[k] += lp.delta;
                            if (Math.abs(kp.times[k]) > 10800) throw new Error("Время ключа выйдет за диапазон AE");
                        }
                    } else {
                        if (!relevant(p)) continue;
                        if (p.isSeparationLeader && p.dimensionsSeparated) continue;
                        if (p.propertyValueType !== PropertyValueType.MARKER && !allowedType(p.propertyValueType)) throw new Error("Специальные ключи свойства "+p.matchName+" пока не поддержаны");
                        for (k = 0; k < path.length; k++) if (path[k].match === "ADBE Layer Overrides") throw new Error("Essential Properties: частичный перенос пока не поддержан");
                        kp = partial(p);
                        if (!kp.moved) continue;
                    }
                    entries.push({path:path,snapshot:kp.snapshot,times:kp.times,moved:kp.moved}); moved += kp.moved;
                }
            } catch (captureError) { failed = errorInfo(captureError).message; }
            if (failed) { plan.skips.push(labelFor(layer,[])+": весь слой пропущен — "+failed); continue; }
            plan.changes.push({kind:lp.kind,layer:layer,before:{start:layer.startTime,inPoint:layer.inPoint,outPoint:layer.outPoint},
                after:{start:lp.start,inPoint:lp.inPoint,outPoint:lp.outPoint},properties:entries,delta:lp.delta,moved:moved,label:labelFor(layer,[])});
        }
        if (request.compMarkers && comp.markerProperty && comp.markerProperty.numKeys && relevant(comp.markerProperty)) {
            layer = null;
            try {
                kp = partial(comp.markerProperty);
                if (kp.moved) plan.changes.push({kind:"property",layer:null,path:[],snapshot:kp.snapshot,times:kp.times,moved:kp.moved,label:"Маркеры композиции"});
            } catch (markerError) { plan.skips.push("Маркеры композиции: "+errorInfo(markerError).message); }
        }
        return plan;
    }
    function target(change, comp) { return change.layer ? resolve(change.layer,change.path) : comp.markerProperty; }
    function checkLayer(change, after, tolerance) {
        var v = after ? change.after : change.before, l = change.layer;
        if (Math.abs(l.startTime-v.start) > tolerance || Math.abs(l.inPoint-v.inPoint) > tolerance || Math.abs(l.outPoint-v.outPoint) > tolerance) {
            throw new Error("Границы слоя не совпадают с расчётом");
        }
    }
    function verifyEntry(layer, entry, times, tolerance) {
        var p = resolve(layer,entry.path);
        if (entry.snapshot.nativeOnly) verifyNative(p,entry.snapshot,times,tolerance);
        else verifyProperty(p,entry.snapshot,times,tolerance);
    }
    function verifyLayerProperties(change, after, tolerance) {
        var i, entry;
        for (i = 0; i < change.properties.length; i++) {
            entry = change.properties[i];
            verifyEntry(change.layer,entry,after ? entry.times : originalTimes(entry.snapshot),tolerance);
        }
    }
    function setBounds(layer, bounds, moveStart) {
        if (moveStart && layer.startTime !== bounds.start) layer.startTime = bounds.start;
        /* Expand before trimming to avoid a transient reversed interval during a large whole-layer move. */
        if (bounds.outPoint > layer.outPoint) layer.outPoint = bounds.outPoint;
        if (bounds.inPoint < layer.inPoint) layer.inPoint = bounds.inPoint;
        if (layer.inPoint !== bounds.inPoint) layer.inPoint = bounds.inPoint;
        if (layer.outPoint !== bounds.outPoint) layer.outPoint = bounds.outPoint;
    }
    function restoreChangeExpressions(change, comp) {
        var j, entry;
        if (change.kind === "property") restoreExpressionState(target(change,comp),change.snapshot);
        else for (j = 0; j < change.properties.length; j++) {
            entry = change.properties[j]; restoreExpressionState(resolve(change.layer,entry.path),entry.snapshot);
        }
    }
    function verifyChange(change, comp, after, tolerance) {
        if (change.kind !== "property") { checkLayer(change,after,tolerance); verifyLayerProperties(change,after,tolerance); }
        else verifyProperty(target(change,comp),change.snapshot,after ? change.times : originalTimes(change.snapshot),tolerance);
    }
    function diagnosticRead(fn) {
        try { var value = fn(); return typeof value === "undefined" ? "unknown" : value; }
        catch (unreadableDiagnostic) { return "unavailable"; }
    }
    function diagnosticBounds(layer) {
        return {start:diagnosticRead(function () { return layer.startTime; }),
            inPoint:diagnosticRead(function () { return layer.inPoint; }),
            outPoint:diagnosticRead(function () { return layer.outPoint; })};
    }
    function diagnosticSource(layer) {
        var source = null, result = {}, markers, i, protectedCount = 0;
        result.stretch = diagnosticRead(function () { return layer.stretch; });
        result.timeRemapEnabled = diagnosticRead(function () { return layer.timeRemapEnabled; });
        result.hasTrackMatte = diagnosticRead(function () { return layer.hasTrackMatte; });
        result.isTrackMatte = diagnosticRead(function () { return layer.isTrackMatte; });
        result.parented = diagnosticRead(function () { return layer.parent ? true : false; });
        try { source = layer.source; } catch (missingSource) { }
        if (!source) { result.kind = "none or unavailable"; return result; }
        result.kind = source instanceof CompItem ? "CompItem" : "FootageItem";
        result.duration = diagnosticRead(function () { return source.duration; });
        result.frameDuration = diagnosticRead(function () { return source.frameDuration; });
        result.isStill = diagnosticRead(function () { return source.mainSource ? source.mainSource.isStill : "not footage"; });
        result.protectedRegions = diagnosticRead(function () {
            markers = source.markerProperty;
            if (!markers) return 0;
            for (i = 1; i <= markers.numKeys && i <= 1000; i++) if (markers.keyValue(i).protectedRegion) protectedCount++;
            return markers.numKeys > 1000 ? "at least "+protectedCount+" (scan limited)" : protectedCount;
        });
        return result;
    }
    function captureFailure(change, phase) {
        var failure = {phase:phase};
        if (!change) return failure;
        failure.kind = change.kind; failure.target = change.label;
        if (change.layer) {
            failure.layerIndex = diagnosticRead(function () { return change.layer.index; });
            failure.layerId = diagnosticRead(function () { return change.layer.id; });
            failure.before = {start:change.before.start,inPoint:change.before.inPoint,outPoint:change.before.outPoint};
            var expected = phase === "preflight" ? change.before : change.after;
            failure.expected = {start:expected.start,inPoint:expected.inPoint,outPoint:expected.outPoint};
            failure.actual = diagnosticBounds(change.layer); failure.source = diagnosticSource(change.layer);
        }
        return failure;
    }
    function reportFailure(failure, frameDuration) {
        var lines = [], names = ["start","inPoint","outPoint"], labels = ["Start","In","Out"], i, delta, source;
        lines.push("Сбой: phase="+failure.phase+"; target="+(failure.target || "до выбора цели")+"; kind="+(failure.kind || "unknown"));
        function bounds(label,b) { return label+" (s): Start="+b.start+"; In="+b.inPoint+"; Out="+b.outPoint; }
        if (failure.actual && failure.expected) {
            lines.push(bounds("До операции",failure.before),bounds("Ожидалось",failure.expected),bounds("Фактически в момент сбоя, ДО отката",failure.actual));
            for (i = 0; i < names.length; i++) if (typeof failure.actual[names[i]] === "number") {
                delta = failure.actual[names[i]]-failure.expected[names[i]];
                lines.push("Отклонение "+labels[i]+": "+delta+" s / "+(delta/frameDuration)+" fr");
            }
        }
        source = failure.source;
        if (source) {
            lines.push("Layer: stretch="+source.stretch+"; timeRemap="+source.timeRemapEnabled+"; parented="+source.parented+"; hasTrackMatte="+source.hasTrackMatte+"; isTrackMatte="+source.isTrackMatte);
            lines.push("Source duration="+source.duration+" s; type="+source.kind+"; frameDuration="+source.frameDuration+"; isStill="+source.isStill+"; protectedRegions="+source.protectedRegions);
        }
        return lines;
    }
    function captureLayerSelection(comp) {
        var state = [], i, layer;
        for (i = 1; i <= comp.numLayers; i++) {
            layer = comp.layer(i); state.push({layer:layer,selected:layer.selected === true});
        }
        return state;
    }
    function restoreLayerSelection(comp, state) {
        var pass, i, entry, failures = [];
        /* Key setters may activate their owner. Restore deselected layers first,
           then the user's selected set; never unlock or blanket-deselect the scene. */
        for (pass = 0; pass < 2; pass++) for (i = 0; i < state.length; i++) {
            entry = state[i]; if (entry.selected !== (pass === 1)) continue;
            try {
                if (comp.layer(entry.layer.index) !== entry.layer) throw new Error("Состав слоёв изменился");
                if (entry.layer.selected !== entry.selected) entry.layer.selected = entry.selected;
            } catch (selectionWriteError) { failures.push("Layer #"+entry.layer.index+": "+errorInfo(selectionWriteError).message); }
        }
        for (i = 0; i < state.length; i++) {
            try { if (state[i].layer.selected !== state[i].selected) throw new Error("Выделение слоя не совпало с исходным"); }
            catch (selectionReadError) { failures.push("Layer #"+state[i].layer.index+": "+errorInfo(selectionReadError).message); }
        }
        if (failures.length) throw new Error(failures.join("\n"));
    }
    function applyPlan(plan) {
        var result = {ok:false,partial:false,selectionRestored:null,changed:0,changedLayers:0,movedKeys:0,attempted:0,restored:false,recoveryErrors:[],skipped:plan.skips.length};
        var phase = "preflight", currentChange = null, layerSelection = null, recovering = false;
        var opened = false, touched = [], tolerance = plan.context.frameDuration * 0.000001, i, j, c, p, entry;
        try {
            if (plan.errors.length) throw new Error(plan.errors.join("\n"));
            if (app.project.activeItem !== plan.comp) throw new Error("Активная композиция изменилась; повторите действие");
            if (plan.request.operation === "closeGap") validateGapPlan(plan);
            if (!plan.changes.length) { result.ok = true; return result; }
            phase = "captureSelection"; layerSelection = captureLayerSelection(plan.comp); phase = "preflight";
            for (i = 0; i < plan.changes.length; i++) {
                c = plan.changes[i]; currentChange = c;
                if (c.layer && (c.layer.locked || plan.comp.layer(c.layer.index) !== c.layer)) throw new Error("Слой недоступен или заблокирован");
                if (c.kind !== "property") { checkLayer(c,false,tolerance); verifyLayerProperties(c,false,tolerance); }
                else verifyProperty(target(c,plan.comp),c.snapshot,originalTimes(c.snapshot),tolerance);
            }
            app.beginUndoGroup(plan.request.operation === "closeGap" ? "FrameFlow AE 1.3 — Убрать паузу" : "FrameFlow AE 1.3 — Time Offset"); opened = true;
            for (i = 0; i < plan.changes.length; i++) {
                phase = "apply"; c = plan.changes[i]; currentChange = c; touched.push(c); result.attempted++;
                if (c.kind === "layer") {
                    setBounds(c.layer,c.after,true);
                } else if (c.kind === "edge") {
                    for (j = 0; j < c.properties.length; j++) {
                        entry = c.properties[j]; restoreProperty(resolve(c.layer,entry.path),entry.snapshot,entry.times);
                    }
                    setBounds(c.layer,c.after,false);
                } else {
                    p = target(c,plan.comp); restoreProperty(p,c.snapshot,c.times);
                    verifyProperty(target(c,plan.comp),c.snapshot,c.times,tolerance);
                }
                if (c.kind !== "property") { checkLayer(c,true,tolerance); verifyLayerProperties(c,true,tolerance); result.changedLayers++; }
                result.movedKeys += c.moved; result.changed++;
            }
            /* A later layer may have expressions that reference an earlier one: validate the stable final scene. */
            for (i = 0; i < touched.length; i++) { phase = "restoreExpressions"; currentChange = touched[i]; restoreChangeExpressions(touched[i],plan.comp); }
            phase = "restoreSelection"; currentChange = null; restoreLayerSelection(plan.comp,layerSelection); result.selectionRestored = true;
            for (i = 0; i < touched.length; i++) { phase = "finalVerify"; currentChange = touched[i]; verifyChange(touched[i],plan.comp,true,tolerance); }
            result.partial = result.changed > 0 && result.skipped > 0;
            result.ok = true;
        } catch (e) {
            recovering = true; result.error = errorInfo(e);
            try { result.failure = captureFailure(currentChange,phase); } catch (diagnosticFailure) { /* Preserve the original failure. */ }
            for (i = touched.length-1; i >= 0; i--) {
                c = touched[i];
                if (c.kind !== "property") {
                    try { setBounds(c.layer,c.before,c.kind === "layer"); checkLayer(c,false,tolerance); }
                    catch (boundaryRecoveryError) { result.recoveryErrors.push(c.label+": "+errorInfo(boundaryRecoveryError).message); }
                    /* One failed boundary/property recovery must not prevent the remaining recoveries. */
                    for (j = 0; j < c.properties.length; j++) {
                        entry = c.properties[j];
                        try {
                            try { verifyEntry(c.layer,entry,originalTimes(entry.snapshot),tolerance); }
                            catch (needsRepair) {
                                if (entry.snapshot.nativeOnly) throw needsRepair;
                                restoreProperty(resolve(c.layer,entry.path),entry.snapshot,originalTimes(entry.snapshot));
                            }
                            verifyEntry(c.layer,entry,originalTimes(entry.snapshot),tolerance);
                        } catch (propertyRecoveryError) { result.recoveryErrors.push(labelFor(c.layer,entry.path)+": "+errorInfo(propertyRecoveryError).message); }
                    }
                } else {
                    try {
                        restoreProperty(target(c,plan.comp),c.snapshot,originalTimes(c.snapshot));
                        verifyProperty(target(c,plan.comp),c.snapshot,originalTimes(c.snapshot),tolerance);
                    } catch (recoverError) { result.recoveryErrors.push(c.label+": "+errorInfo(recoverError).message); }
                }
            }
            for (i = 0; i < touched.length; i++) {
                try { restoreChangeExpressions(touched[i],plan.comp); }
                catch (expressionRecoveryError) { result.recoveryErrors.push(touched[i].label+": "+errorInfo(expressionRecoveryError).message); }
            }
        } finally {
            if (opened && layerSelection && !result.ok) {
                try { restoreLayerSelection(plan.comp,layerSelection); result.selectionRestored = true; }
                catch (selectionCleanupError) { result.selectionRestored = false; result.selectionError = errorInfo(selectionCleanupError); result.ok = false; }
            }
            if (recovering) {
                for (i = 0; i < touched.length; i++) {
                    try { verifyChange(touched[i],plan.comp,false,tolerance); }
                    catch (finalRecoveryError) { result.recoveryErrors.push(touched[i].label+": "+errorInfo(finalRecoveryError).message); }
                }
                if (touched.length && !result.recoveryErrors.length) { result.restored = true; result.changed = 0; result.changedLayers = 0; result.movedKeys = 0; }
            }
            if (opened) try { app.endUndoGroup(); } catch (cleanup) { result.cleanupError = errorInfo(cleanup); result.ok = false; }
        }
        return result;
    }
    function environment() {
        var lines = ["FrameFlow AE 1.3", "Дата: " + new Date().toString()];
        function read(label,fn) { try { lines.push(label+": "+fn()); } catch (ignored) { lines.push(label+": неизвестно"); } }
        read("AE",function(){return app.version;}); read("Build",function(){return app.buildNumber;});
        read("OS",function(){return $.os;}); read("ExtendScript",function(){return $.version;});
        return lines;
    }
    function report(plan, result, heading) {
        var lines = environment(), i, r = plan.request, c = plan.context;
        lines.push(heading, "Scope="+r.scope+"; Region="+r.region,
            "Frames="+(r.operation === "closeGap" ? r.gap.frames : r.frames)+"; Direction="+r.direction+"; Delta="+FFCore.offsetSeconds(c,r)+" s",
            "Comp id="+plan.comp.id+"; FPS="+(1/c.frameDuration)+"; CTI="+c.cti+" s; Duration="+c.duration+" s",
            "К изменению: "+plan.changes.length+"; Пропуски: "+plan.skips.length+"; Блокировки: "+plan.errors.length);
        if (r.operation === "closeGap") lines.push("Удаление паузы ["+r.gap.start+", "+r.gap.end+") s; курсор до операции="+r.originalCTI+" s");
        if (r.region === "range") lines.push("Диапазон ["+r.from+", "+r.to+") s; кадры от внутреннего начала композиции");
        if (!result) {
            var plannedLayers = 0, plannedKeys = 0;
            for (i = 0; i < plan.changes.length; i++) {
                if (plan.changes[i].kind !== "property") plannedLayers++;
                plannedKeys += plan.changes[i].moved;
            }
            lines.push("План сдвига — Слоёв: "+plannedLayers+"; ключей: "+plannedKeys+"; слоёв в области: "+plan.layerCount);
            lines.push("Сцена не изменена. Действие в панели заново проверит текущую сцену перед записью.");
        }
        if (result) {
            lines.push("ok="+result.ok+"; changed="+result.changed+"; movedKeys="+result.movedKeys+"; attempted="+result.attempted+"; skipped="+result.skipped+"; partial="+result.partial);
            if (result.error) lines.push("Ошибка: "+result.error.message, "Line: "+(result.error.line || "неизвестно"), "File: "+(result.error.file || "неизвестно"));
            if (result.error && result.error.stack) lines.push("Stack: "+result.error.stack);
            if (result.failure) lines = lines.concat(reportFailure(result.failure,c.frameDuration));
            if (result.restored) lines.push("Восстановление исходных данных прошло readback-проверку.");
            if (result.selectionRestored === true) lines.push("Выделение слоёв сохранено.");
            if (result.selectionError) lines.push("ВЫДЕЛЕНИЕ НЕ ВОССТАНОВЛЕНО: "+result.selectionError.message);
            if (result.cleanupError) lines.push("Ошибка закрытия Undo Group: "+result.cleanupError.message);
            for (i = 0; i < result.recoveryErrors.length; i++) lines.push("ВОССТАНОВЛЕНИЕ НЕ ПОДТВЕРЖДЕНО: "+result.recoveryErrors[i]);
        }
        for (i = 0; i < plan.changes.length && lines.length < LIMITS.reportLines; i++) {
            lines.push("Цель: "+plan.changes[i].label+(plan.changes[i].kind !== "property" ? "; kind="+plan.changes[i].kind+"; Start/In/Out "+plan.changes[i].after.start+" / "+plan.changes[i].after.inPoint+" / "+plan.changes[i].after.outPoint : "; ключей "+plan.changes[i].moved));
        }
        for (i = 0; i < plan.errors.length && lines.length < LIMITS.reportLines; i++) lines.push("БЛОК: "+plan.errors[i]);
        for (i = 0; i < plan.skips.length && lines.length < LIMITS.reportLines; i++) lines.push("ПРОПУСК: "+plan.skips[i]);
        if (lines.length >= LIMITS.reportLines) lines.push("Подробности ограничены 300 строками; сузьте область для полного списка.");
        if (plan.notes.length) lines.push(plan.notes[0]);
        lines.push("Readback проверяет доступные данные; визуальный результат, недоступные атрибуты и внешние Expressions требуют отдельного теста в AE.");
        return lines.join("\n");
    }
    return {readContext:readContext,inspectGap:inspectGap,prepareGap:prepareGap, prepare:prepare, applyPlan:applyPlan, report:report, environment:environment,
        snapshotProperty:snapshotProperty, restoreProperty:restoreProperty, verifyProperty:verifyProperty,
        scanLayer:scanLayer, pathOf:pathOf, errorInfo:errorInfo, originalTimes:originalTimes};
}());

/* FrameFlow AE 1.3. Native controls and host typography; no background scene edits. */
var FFUI = (function () {
    var CONFIG = {title:"FrameFlow AE 1.3",namespace:"FrameFlowAE",prefsKey:"preferences",stateKey:"panelState",width:324,minWidth:276,maxLog:100};
    function create(thisObj) {
        var root = thisObj instanceof Panel ? thisObj : new Window("palette",CONFIG.title,undefined,{resizeable:true});
        var controls = {}, scopes = ["auto","all","selected"], busy = false, sceneReady = false, logs = [];
        var lastReport = FFHost.environment().join("\n"), lastContextTick = 0, presetColumns = 0, presetRows = 1;
        function loadPreferences(key,parse) {
            var raw = null, parsed;
            try { if (app.settings.haveSetting(CONFIG.namespace,key)) raw = app.settings.getSetting(CONFIG.namespace,key); parsed = parse(raw); }
            catch (e) { parsed = parse(null); parsed.storageProtected = true; parsed.note = "Параметры недоступны; изменения действуют в этой сессии."; }
            parsed.raw = raw; return parsed;
        }
        var loaded = loadPreferences(CONFIG.prefsKey,FFCore.parseSettings), panelLoaded = loadPreferences(CONFIG.stateKey,FFCore.parsePanelState);
        var settings = loaded.settings, panelState = panelLoaded.settings;
        root.orientation = "column"; root.alignChildren = ["fill","top"]; root.preferredSize = [CONFIG.width,320];
        function row(parent) { var g = parent.add("group"); g.orientation = "row"; g.alignChildren = ["fill","center"]; g.spacing = settings.spacing; g.margins = 0; return g; }
        function label(parent,text) { var t = parent.add("statictext",undefined,text); t.alignment = ["left","center"]; return t; }
        function dropdown(parent,items) { var d = parent.add("dropdownlist",undefined,items); d.alignment = ["fill","center"]; d.selection = 0; return d; }
        function index(d) { return d.selection ? d.selection.index : 0; }
        function font(control,extra,bold) {
            try { var f = control.graphics.font; control.graphics.font = ScriptUI.newFont(f.family || f.name,bold ? ScriptUI.FontStyle.BOLD : f.style,f.size+extra); }
            catch (unsupportedFont) { /* Typography is optional; native controls remain usable. */ }
        }
        function widthOf(control,fallback) { return control.size && (control.size.width || control.size[0]) || fallback; }
        var head = row(root), title = label(head,"FrameFlow"); title.alignment = ["fill","center"]; font(title,1,true);
        var version = label(head,"1.3"); version.alignment = ["right","center"];
        controls.settings = head.add("button",undefined,"Настройки"); controls.settings.alignment = ["right","center"]; controls.settings.preferredSize.width = 86;
        controls.scope = dropdown(root,["Авто: выделенные, иначе все","Вся композиция","Только выделенные слои"]);
        controls.scope.selection = panelState.scope === "all" ? 1 : (panelState.scope === "selected" ? 2 : 0);
        controls.scope.helpTip = "Авто использует выделенные слои, а без выделения — все. Выделение отдельных ключей не ограничивает действие. Пауза определяется только в этой области.";
        var frameRow = row(root); label(frameRow,"Сдвиг");
        controls.frames = frameRow.add("edittext",undefined,String(panelState.frames)); controls.frames.characters = 7; controls.frames.alignment = ["fill","center"]; controls.frames.preferredSize.height = 32; font(controls.frames,3,false);
        controls.frames.helpTip = "Целое число кадров, 1–1000000. Быстрые значения ниже. Изменение числа само по себе не меняет сцену.";
        label(frameRow,"кадр.");
        controls.presetGroup = root.add("group"); controls.presetGroup.orientation = "column"; controls.presetGroup.alignChildren = ["fill","top"]; controls.presetGroup.margins = 0;
        controls.presets = [];
        var actions = row(root);
        function side(text,region) {
            var p = actions.add("panel",undefined,text); p.orientation = "row"; p.alignChildren = ["fill","center"]; p.alignment = ["fill","center"]; p.margins = [6,14,6,6]; p.spacing = 4;
            var back = p.add("button",undefined,"−1"), forward = p.add("button",undefined,"+1"); back.preferredSize = forward.preferredSize = [54,30];
            back.helpTip = text+": сдвинуть назад. Ключ на курсоре относится к «После».";
            forward.helpTip = text+": сдвинуть вперёд. Ключ на курсоре относится к «После».";
            back.onClick = function () { run(region,-1); }; forward.onClick = function () { run(region,1); };
            return {back:back,forward:forward};
        }
        controls.before = side("До курсора","before"); controls.after = side("После курсора","after");
        controls.gap = root.add("button",undefined,"Убрать паузу"); controls.gap.enabled = false; controls.gap.preferredSize.height = 26;
        controls.context = root.add("statictext",undefined,"",{multiline:true}); controls.context.preferredSize.height = 32;
        var footer = row(root);
        controls.status = footer.add("statictext",undefined,"Ключ на курсоре относится к «После».",{multiline:true}); controls.status.alignment = ["fill","center"]; controls.status.preferredSize.height = 34;
        controls.report = footer.add("button",undefined,"Детали"); controls.report.alignment = ["right","center"]; controls.report.preferredSize.width = 64;
        function status(text) { controls.status.text = text; controls.status.helpTip = text; }
        function log(text) { if (!settings.logging) return; logs.push(new Date().toTimeString()+" "+text); while (logs.length > CONFIG.maxLog) logs.shift(); }
        function persist(storage,key,encoded) {
            var current = null;
            if (storage.storageProtected) return storage.note;
            try {
                if (app.settings.haveSetting(CONFIG.namespace,key)) current = app.settings.getSetting(CONFIG.namespace,key);
                if (current !== storage.raw && current !== encoded) {
                    storage.storageProtected = true; storage.note = "Параметры изменены в другой панели. Новые значения действуют в этой сессии; сохранённые оставлены без изменений."; return storage.note;
                }
                if (current !== encoded) app.settings.saveSetting(CONFIG.namespace,key,encoded);
                storage.raw = encoded; return "";
            } catch (e) { return "Не удалось сохранить параметры; они действуют в этой сессии. "+FFHost.errorInfo(e).message; }
        }
        function savePanelState() { return persist(panelLoaded,CONFIG.stateKey,FFCore.encodePanelState(panelState)); }
        function updateStep() {
            var n = null, i, b, sides = [controls.before,controls.after];
            try { n = FFCore.parseFrames(controls.frames.text); } catch (invalidStep) { }
            for (i = 0; i < sides.length; i++) {
                sides[i].back.text = n === null || n > 9999 ? "−" : "−"+n; sides[i].forward.text = n === null || n > 9999 ? "+" : "+"+n;
                sides[i].back.enabled = sides[i].forward.enabled = sceneReady && n !== null;
                sides[i].back.helpTip = "Назад на "+(n === null ? "указанное число" : n)+" кадр. До: ключи строго до курсора; После: на курсоре и позже.";
                sides[i].forward.helpTip = "Вперёд на "+(n === null ? "указанное число" : n)+" кадр. До: ключи строго до курсора; После: на курсоре и позже.";
            }
            for (i = 0; i < controls.presets.length; i++) { b = controls.presets[i]; b.helpTip = (n === b.step ? "Текущий шаг: " : "Выбрать шаг: ")+b.step+" кадр."; }
            return n;
        }
        function minSize() {
            root.minimumSize = [CONFIG.minWidth+Math.max(0,settings.spacing-6)*2,312+(presetRows-1)*28+Math.max(0,settings.spacing-6)*7+(settings.density === 1 ? 8 : 0)];
        }
        function renderPresets(force) {
            var margin = settings.density === 1 ? 12 : 8, available = widthOf(root,CONFIG.width)-margin*2, maxWidth = 36, cols, i, g, b, measured;
            for (i = 0; i < settings.favorites.length; i++) {
                measured = String(settings.favorites[i]).length*8;
                try { measured = controls.frames.graphics.measureString(String(settings.favorites[i]),root.graphics.font).width; } catch (noMeasure) { }
                maxWidth = Math.max(maxWidth,Math.ceil(measured)+20);
            }
            cols = Math.max(1,Math.min(4,Math.floor((available+settings.spacing)/(maxWidth+settings.spacing))));
            if (!force && cols === presetColumns) return false;
            presetColumns = cols; presetRows = Math.ceil(settings.favorites.length/cols);
            while (controls.presetGroup.children.length) controls.presetGroup.remove(controls.presetGroup.children[controls.presetGroup.children.length-1]);
            controls.presets = []; controls.presetGroup.spacing = settings.spacing;
            function addPreset(parent,value) {
                var button = parent.add("button",undefined,String(value)); button.preferredSize = [Math.floor((available-(cols-1)*settings.spacing)/cols),24]; button.alignment = ["fill","center"]; button.step = value;
                button.onClick = function () { controls.frames.text = String(value); commitStep(); };
                controls.presets.push(button);
            }
            for (i = 0; i < settings.favorites.length; i++) {
                if (i % cols === 0) g = row(controls.presetGroup);
                addPreset(g,settings.favorites[i]);
            }
            minSize(); updateStep(); return true;
        }
        function reflow() {
            var i; root.spacing = settings.spacing; root.margins = settings.density === 1 ? 12 : 8;
            for (i = 0; i < root.children.length; i++) if (root.children[i].type === "group") root.children[i].spacing = settings.spacing;
            renderPresets(true); minSize(); root.layout.layout(true); root.layout.resize();
        }
        function commitStep() {
            var n, note;
            try {
                n = FFCore.parseFrames(controls.frames.text); panelState.frames = n; note = savePanelState(); updateStep();
                status(note || "Шаг: "+n+" кадр.");
            } catch (e) { updateStep(); status(FFHost.errorInfo(e).message); }
        }
        function formatFrames(n) {
            if (n > 0 && n < 0.001) return "<0.001";
            if (Math.abs(n-Math.round(n)) < 0.000001) return String(Math.round(n));
            return n.toFixed(3).replace(/\.?0+$/,"");
        }
        function countText(n) { return "слоёв: "+n; }
        function refreshContext(force) {
            var now = new Date().getTime(), view, c, n, target, name, scope, framesText;
            if (busy || (force !== true && now-lastContextTick < 250)) return;
            lastContextTick = now;
            try {
                scope = scopes[index(controls.scope)]; view = FFHost.inspectGap(scope); c = view.context; n = c.comp.selectedLayers.length;
                target = scope === "all" || (scope === "auto" && !n) ? "Все · "+countText(c.comp.numLayers) : "Выбрано · "+countText(n);
                name = String(c.comp.name); if (name.length > 26) name = name.substring(0,23)+"…";
                controls.context.text = name+" · "+(1/c.frameDuration).toFixed(2)+" FPS\n"+target+" · курсор "+(c.cti/c.frameDuration).toFixed(2);
                controls.context.helpTip = c.comp.name+"\n"+target+". Позиция курсора указана в кадрах от начала композиции. Каждое действие читает текущие данные AE.";
                sceneReady = view.layers.length > 0;
                controls.gap.enabled = view.gap.ok;
                if (view.gap.ok) {
                    framesText = formatFrames(view.gap.frames);
                    controls.gap.text = "Убрать паузу · "+framesText+" кадр.";
                    controls.gap.helpTip = "Удалить весь пустой промежуток под курсором: "+framesText+" кадр. Все следующие слои выбранной области сдвинутся назад. Длительность композиции и курсор сохраняются.";
                } else { controls.gap.text = "Убрать паузу"; controls.gap.helpTip = view.gap.reason; }
            } catch (e) {
                sceneReady = false; controls.context.text = FFHost.errorInfo(e).message; controls.context.helpTip = controls.context.text;
                controls.gap.enabled = false; controls.gap.text = "Убрать паузу"; controls.gap.helpTip = controls.context.text;
            }
            updateStep();
        }
        function run(region,direction) {
            var plan, result, message, note = "", gapMode = region === "gap", n;
            if (busy) return;
            busy = true; root.enabled = false; status(gapMode ? "Удаление паузы…" : "Сдвиг…");
            try {
                if (gapMode) plan = FFHost.prepareGap({scope:scopes[index(controls.scope)],compMarkers:panelState.compMarkers});
                else {
                    n = FFCore.parseFrames(controls.frames.text); panelState.frames = n; note = savePanelState();
                    plan = FFHost.prepare({scope:scopes[index(controls.scope)],frames:n,region:region,direction:direction,compMarkers:panelState.compMarkers});
                }
                result = FFHost.applyPlan(plan); lastReport = FFHost.report(plan,result,gapMode ? "УБРАТЬ ПАУЗУ" : "TIME OFFSET");
                if (result.selectionError) message = "Выделение не восстановлено.\nОткройте Детали.";
                else if (result.ok && result.changed) {
                    message = gapMode ? "Убрана пауза · "+formatFrames(plan.request.gap.frames)+" кадр.\nСлоёв: "+result.changedLayers : "Слоёв: "+result.changedLayers+" · ключей: "+result.movedKeys+"\nПропущено: "+plan.skips.length+(plan.mediaLimits.length ? " · предел медиа" : "");
                } else if (result.ok && plan.mediaLimits.length) message = "Предел исходного медиа.\nСлой пропущен — см. Детали.";
                else if (result.ok) message = "На этой стороне нет доступных целей."+(plan.skips.length ? "\nПропущено: "+plan.skips.length+" — см. Детали." : "");
                else if (result.restored) message = result.failure && result.failure.layerIndex ? "Ошибка на слое №"+result.failure.layerIndex+"; данные восстановлены.\nПричина — в Деталях." : "Ошибка; исходные данные восстановлены.\nПричина — в Деталях.";
                else if (result.recoveryErrors.length) message = "Восстановление не подтверждено.\nCtrl/Cmd+Z — отменить; см. Детали.";
                else if (plan.errors.length) message = "Операция отменена до записи.\nПричина — в Деталях.";
                else message = "Ошибка: "+(result.error ? result.error.message : "Undo Group")+"\nОткройте Детали.";
                status(message+(note ? "\n"+note : "")); log((gapMode ? "gap" : region)+" ok="+result.ok+" layers="+result.changedLayers+" keys="+result.movedKeys);
            } catch (e) {
                status(FFHost.errorInfo(e).message); lastReport = FFHost.environment().join("\n")+"\nОшибка до применения: "+FFHost.errorInfo(e).message;
            } finally { root.enabled = true; busy = false; refreshContext(true); }
        }
        function exportText(text) {
            var file = File.saveDialog("Сохранить отчёт FrameFlow AE", "Text:*.txt"), opened = false;
            if (!file) return;
            try {
                file.encoding = "UTF-8"; file.lineFeed = "Unix";
                if (!file.open("w")) throw new Error(file.error || "Не удалось открыть файл");
                opened = true;
                if (!file.write(text)) throw new Error(file.error || "Не удалось записать отчёт");
            } finally { if (opened) file.close(); }
        }
        function reportDialog() {
            var win = new Window("dialog", "FrameFlow AE 1.3 — отчёт",undefined,{resizeable:true}), text = lastReport, appliedText;
            var previewFrames = null, unavailable = "", previewRow, restore, field, note;
            win.orientation = "column"; win.alignChildren = ["fill","top"]; win.margins = 12; win.spacing = 8; win.minimumSize = [460,460];
            if (logs.length) text += "\n\nЛОГ (включён пользователем)\n"+logs.join("\n");
            appliedText = text;
            try { previewFrames = FFCore.parseFrames(controls.frames.text); FFHost.readContext(); }
            catch (previewUnavailable) { unavailable = FFHost.errorInfo(previewUnavailable).message; }
            label(win,"Проверить без применения"+(previewFrames !== null ? " · "+previewFrames+" кадр." : ""));
            previewRow = row(win);
            function inspect(region,direction) {
                var plan;
                try {
                    plan = FFHost.prepare({scope:scopes[index(controls.scope)],frames:FFCore.parseFrames(controls.frames.text),region:region,direction:direction,compMarkers:panelState.compMarkers});
                    text = FFHost.report(plan,null,"ПРОВЕРКА БЕЗ ПРИМЕНЕНИЯ");
                    note.text = plan.errors.length ? "Есть блокировки. Причины указаны в отчёте; сцена не изменена." : "Сцена не изменена. Для сдвига закройте окно и нажмите нужную кнопку в панели.";
                } catch (previewError) {
                    text = FFHost.environment().join("\n")+"\nПРОВЕРКА БЕЗ ПРИМЕНЕНИЯ\nОшибка: "+FFHost.errorInfo(previewError).message;
                    note.text = "Проверка недоступна; сцена не изменена. Последний результат сохранён.";
                }
                field.text = text; restore.enabled = true;
            }
            function addPreview(text,region,direction) {
                var button = previewRow.add("button",undefined,text); button.alignment = ["fill","center"];
                button.enabled = unavailable === "";
                button.helpTip = "Проверить сдвиг "+(region === "before" ? "до" : "после")+" курсора "+(direction < 0 ? "назад" : "вперёд")+" без изменения слоёв, ключей и выделения.";
                button.onClick = function () { inspect(region,direction); };
            }
            addPreview("До −","before",-1); addPreview("До +","before",1);
            addPreview("После −","after",-1); addPreview("После +","after",1);
            label(win,"Выделите текст и нажмите Ctrl/Cmd+C.");
            field = win.add("edittext",undefined,text,{multiline:true,readonly:true,scrolling:true}); field.preferredSize = [580,360]; field.alignment = ["fill","fill"];
            note = win.add("statictext",undefined,unavailable || "Проверка покажет план сдвига на текущем кадре. Применение — в основной панели.",{multiline:true}); note.preferredSize.height = 34;
            var buttons = row(win); restore = buttons.add("button",undefined,"Последний результат"); restore.enabled = false;
            var save = buttons.add("button",undefined,"Сохранить TXT"), close = buttons.add("button",undefined,"Закрыть",{name:"ok"});
            restore.onClick = function () { text = appliedText; field.text = text; restore.enabled = false; note.text = "Последний результат. Предварительные проверки не меняют его."; };
            save.onClick = function () { try { exportText(text); note.text = "Отчёт доступен для копирования; файл сохранён, если путь был выбран."; }
                catch (e) { note.text = "Экспорт: "+FFHost.errorInfo(e).message+". Исходный отчёт сохранён в поле."; } };
            close.onClick = function () { win.close(); }; win.onResizing = win.onResize = function () { this.layout.resize(); };
            win.show();
        }
        function settingsDialog() {
            var win = new Window("dialog","FrameFlow — настройки"), d, spacing, favorite, logging, markers, apply, reset, cancel, note;
            win.orientation = "column"; win.alignChildren = ["fill","top"]; win.margins = 14; win.spacing = 8;
            font(label(win,"Вид панели"),0,true);
            d = dropdown(win,["Компактно","Свободнее"]); d.selection = settings.density;
            var sg = row(win); label(sg,"Отступ, px"); spacing = sg.add("edittext",undefined,String(settings.spacing)); spacing.characters = 5;
            reset = win.add("button",undefined,"Сбросить только вид");
            label(win,"Быстрые значения кадров · до 8, через запятую"); favorite = win.add("edittext",undefined,settings.favorites.join(","));
            font(label(win,"Действия и диагностика"),0,true);
            markers = win.add("checkbox",undefined,"Сдвигать маркеры композиции"); markers.value = panelState.compMarkers;
            markers.helpTip = "Влияет на сдвиг и удаление паузы. Маркер внутри удаляемой паузы блокирует её удаление.";
            logging = win.add("checkbox",undefined,"Лог операций · до 100 записей"); logging.value = settings.logging;
            note = win.add("statictext",undefined,loaded.note || panelLoaded.note || "Шаг и область запоминаются при изменении. Вид панели и параметры ниже — после Применить.",{multiline:true}); note.preferredSize = [330,58];
            var help = win.add("button",undefined,"Справка"); help.onClick = helpDialog;
            var buttons = row(win); apply = buttons.add("button",undefined,"Применить"); cancel = buttons.add("button",undefined,"Отмена",{name:"cancel"});
            reset.onClick = function () { d.selection = 0; spacing.text = "6"; };
            apply.onClick = function () {
                var n, next, appearanceNote, stateNote;
                try {
                    n = FFCore.parseFrames(spacing.text); if (n < 3 || n > 16) throw new Error("Отступ: целое от 3 до 16 px.");
                    next = {density:index(d),spacing:n,logging:logging.value,favorites:FFCore.parseFavorites(favorite.text)};
                    settings = next; panelState.compMarkers = markers.value;
                    if (!settings.logging) logs = [];
                    appearanceNote = persist(loaded,CONFIG.prefsKey,FFCore.encodeSettings(settings)); stateNote = savePanelState();
                    reflow(); refreshContext(true);
                    status(appearanceNote || stateNote || "Настройки сохранены. Сцена не изменялась."); win.close();
                } catch (e) { note.text = FFHost.errorInfo(e).message; }
            };
            cancel.onClick = function () { win.close(); }; win.show();
        }
        function helpDialog() {
            var win = new Window("dialog","FrameFlow — как работает"); win.orientation = "column"; win.alignChildren = ["fill","top"]; win.margins = 14;
            var text = "СДВИГ\nУкажите число кадров, затем нажмите минус или плюс для времени До / После курсора. Ключ ровно на курсоре относится к После. Целые слои перемещаются нативно вместе с ключами и маркерами; у пересекающих курсор сдвигаются ключи нужной стороны и In либо Out.\n\n"+
                "ОБЛАСТЬ\nАвто использует выделенные слои; без выделения — все. Выделение ключей не ограничивает действие. Выберите Всю композицию, чтобы всегда работать со всеми слоями.\n\n"+
                "УБРАТЬ ПАУЗУ\nПоставьте курсор между слоями. Удаляется весь пустой промежуток в выбранной области, а все следующие слои сдвигаются назад на его точную длину, включая subframes. Locked-слои и выключенные слои учитываются. Если следующий слой заблокирован или недоступен, операция не выполняется частично. Пауза в конце без следующего слоя не удаляется. При включённом переносе маркеров композиции маркер внутри паузы или его пересекающая длительность блокируют удаление.\n\n"+
                "Курсор, длительность композиции, рабочая область и исходное выделение слоёв сохраняются. Один клик — одна операция Undo (Ctrl/Cmd+Z).\n\n"+
                "ПРОВЕРКА БЕЗ ПРИМЕНЕНИЯ\nВ Деталях кнопки До / После показывают план сдвига с текущим шагом, цели, пропуски и блокировки. Они не меняют сцену и не создают Undo. Последний результат остаётся доступен отдельной кнопкой. Перед настоящим сдвигом сцена проверяется заново.\n\n"+
                "НАСТРОЙКИ\nШаг и область запоминаются после завершения ввода. Настройки вида применяются кнопкой Применить. Сброс вида меняет только плотность и отступ. При ошибке сохранения значения остаются в этой сессии.\n\n"+
                "ОГРАНИЧЕНИЯ\nВидео/аудио без Time Remap нельзя продлить за доступный исходник. Если край недоступен, весь этот слой пропускается, остальные продолжают сдвигаться; предел указан в Деталях. Продление со стоп-кадром через Time Remap — отдельная операция.\n\nВложенные композиции изнутри не меняются. Сдвиг не создаёт стоп-кадр видео/аудио. Auto-Bezier может пересчитываться AE. Частичный перенос Roving и неподдержанных специальных свойств пропускает целый слой; причины видны в Деталях. Коллизия ключей отменяет операцию до записи.";
            var field = win.add("edittext",undefined,text,{multiline:true,readonly:true,scrolling:true}); field.preferredSize = [460,370];
            win.add("button",undefined,"Закрыть",{name:"ok"}).onClick = function () { win.close(); }; win.show();
        }
        controls.frames.onChanging = updateStep; controls.frames.onChange = commitStep;
        controls.scope.onChange = function () { panelState.scope = scopes[index(controls.scope)]; var note = savePanelState(); refreshContext(true); status(note || "Область: "+controls.scope.selection.text); };
        controls.gap.onClick = function () { run("gap",-1); };
        controls.settings.onClick = settingsDialog; controls.report.onClick = reportDialog;
        root.onActivate = function () { refreshContext(true); };
        if (root.addEventListener) root.addEventListener("mouseover",function () { refreshContext(false); });
        root.onResizing = root.onResize = function () { if (renderPresets(false)) root.layout.layout(true); this.layout.resize(); };
        reflow(); refreshContext(true);
        if (loaded.note || panelLoaded.note) status(loaded.note || panelLoaded.note);
        if (root instanceof Window) { root.center(); root.show(); }
        return {root:root,controls:controls,reflow:reflow};
    }
    return {create:create};
}());

FFUI.create(thisObj);
}(this));
