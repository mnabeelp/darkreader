import {iterateShadowNodes} from '../utils/dom';
import {isDefinedSelectorSupported} from '../../utils/platform';
import {shouldManageStyle, STYLE_SELECTOR} from './style-manager';

let observer: MutationObserver = null;

interface ChangedStyles {
    created: (HTMLStyleElement | HTMLLinkElement)[];
    updated: (HTMLStyleElement | HTMLLinkElement)[];
    removed: (HTMLStyleElement | HTMLLinkElement)[];
    moved: (HTMLStyleElement | HTMLLinkElement)[];
}

function getAllManageableStyles(nodes: Iterable<Node> | ArrayLike<Node>) {
    const results: (HTMLLinkElement | HTMLStyleElement)[] = [];
    const nodes2 = Array.prototype.slice.call(nodes);
    for (let x = 0, len = nodes2.length; x < len; x++) {
        const node = nodes2[x];
        if (node instanceof Element) {
            if (shouldManageStyle(node)) {
                results.push(node as HTMLLinkElement | HTMLStyleElement);
            }
        }
        if (node instanceof Element || node instanceof ShadowRoot) {
            results.push(
                Array.prototype.slice.call(document.querySelectorAll(STYLE_SELECTOR)).filter(shouldManageStyle) as (HTMLLinkElement | HTMLStyleElement)
            );
        }
    }
    return results;
}

const undefinedGroups = new Map<string, Set<Element>>();
let elementsDefinitionCallback: (elements: Element[]) => void;

function collectUndefinedElements(root: ParentNode) {
    if (!isDefinedSelectorSupported()) {
        return;
    }
    root.querySelectorAll(':not(:defined)')
        .forEach((el) => {
            const tag = el.tagName.toLowerCase();
            if (!undefinedGroups.has(tag)) {
                undefinedGroups.set(tag, new Set());
                customElementsWhenDefined(tag).then(() => {
                    if (elementsDefinitionCallback) {
                        const elements = undefinedGroups.get(tag);
                        undefinedGroups.delete(tag);
                        elementsDefinitionCallback(Array.prototype.slice.call(elements));
                    }
                });
            }
            undefinedGroups.get(tag).add(el);
        });
}

function customElementsWhenDefined(tag: string) {
    return new Promise((resolve) => {
        // `customElements.whenDefined` is not available in extensions
        // https://bugs.chromium.org/p/chromium/issues/detail?id=390807
        if (window.customElements && typeof window.customElements.whenDefined === 'function') {
            customElements.whenDefined(tag).then(resolve);
        } else {
            const checkIfDefined = () => {
                const elements = undefinedGroups.get(tag);
                if (elements && elements.size > 0) {
                    if (elements.values().next().value.matches(':defined')) {
                        resolve();
                    } else {
                        requestAnimationFrame(checkIfDefined);
                    }
                }
            };
            requestAnimationFrame(checkIfDefined);
        }
    });
}

function watchWhenCustomElementsDefined(callback: (elements: Element[]) => void) {
    elementsDefinitionCallback = callback;
}

function unsubscribeFromDefineCustomElements() {
    elementsDefinitionCallback = null;
    undefinedGroups.clear();
}

const shadowObservers = new Set<MutationObserver>();
let nodesShadowObservers = new WeakMap<Node, MutationObserver>();

function unsubscribeFromShadowRootChanges() {
    shadowObservers.forEach((o) => o.disconnect());
    shadowObservers.clear();
    nodesShadowObservers = new WeakMap();
}

export function watchForStyleChanges(update: (styles: ChangedStyles) => void) {
    if (observer) {
        observer.disconnect();
        shadowObservers.forEach((o) => o.disconnect());
        shadowObservers.clear();
        nodesShadowObservers = new WeakMap();
    }

    function handleMutations(mutations: MutationRecord[]) {
        const createdStyles = new Set<HTMLLinkElement | HTMLStyleElement>();
        const updatedStyles = new Set<HTMLLinkElement | HTMLStyleElement>();
        const removedStyles = new Set<HTMLLinkElement | HTMLStyleElement>();
        const movedStyles = new Set<HTMLLinkElement | HTMLStyleElement>();

        const additions = new Set<Node>();
        const deletions = new Set<Node>();
        const styleUpdates = new Set<HTMLLinkElement | HTMLStyleElement>();
        for (let x = 0, len = mutations.length; x < len; x++) {
            const m = mutations[x];
            for (let y = 0, len2 = m.addedNodes.length; y < len2; y++) {
                additions.add(m.addedNodes[y]);
            }
            for (let z = 0, len3 = m.removedNodes.length; z < len3; z++) {
                deletions.add(m.removedNodes[z]);
            }
            if (m.type === 'attributes' && shouldManageStyle(m.target)) {
                styleUpdates.add(m.target as HTMLLinkElement | HTMLStyleElement);
            }
        }
        const styleAdditions = getAllManageableStyles(additions);
        const styleDeletions = getAllManageableStyles(deletions);
        const additionArray = Array.prototype.slice.call(additions);
        const deletionArray = Array.prototype.slice.call(deletions);

        for (let xa = 0, len4 = additionArray.length; xa < len4; xa++) {
            iterateShadowNodes(additionArray[xa], (host) => {
                const shadowStyles = getAllManageableStyles(host.shadowRoot.children);
                if (shadowStyles.length > 0) {
                    styleAdditions.push(...shadowStyles);
                }
            });
        }
        for (let xd = 0, len5 = deletionArray.length; xd < len5; xd++) {
            iterateShadowNodes(deletionArray[xd], (host) => {
                const shadowStyles = getAllManageableStyles(host.shadowRoot.children);
                if (shadowStyles.length > 0) {
                    styleDeletions.push(...shadowStyles);
                }
            });
        }
        for (let sd = 0, len6 = styleDeletions.length; sd < len6; sd++) {
            const style = styleDeletions[sd];
            if (style.isConnected) {
                movedStyles.add(style);
            } else {
                removedStyles.add(style);
            }
        }
        const sua = Array.prototype.slice.call(styleUpdates);
        for (let su = 0, len7 = sua.length; su < len7; su++) {
            const style = sua[su];
            if (!removedStyles.has(style)) {
                updatedStyles.add(style);
            }
        }
        for (let sa = 0, len8 = styleAdditions.length; sa < len8; sa++) {
            const style = styleAdditions[sa];
            if (!(removedStyles.has(style) || movedStyles.has(style) || updatedStyles.has(style))) {
                createdStyles.add(style);
            }
        }
        if (createdStyles.size + removedStyles.size + updatedStyles.size > 0) {
            update({
                created: Array.prototype.slice.call(createdStyles),
                updated: Array.prototype.slice.call(updatedStyles),
                removed: Array.prototype.slice.call(removedStyles),
                moved: Array.prototype.slice.call(movedStyles),
            });
        }
        const aa = Array.prototype.slice.call(additions)
        for (let a = 0, len9 = aa.length; a < len9; a++) {
            const n = aa[a];
            if (n.isConnected) {
                iterateShadowNodes(n, subscribeForShadowRootChanges);
                if (n instanceof Element) {
                    collectUndefinedElements(n);
                }
            }
        }
    }

    function subscribeForShadowRootChanges(node: Element) {
        if (nodesShadowObservers.has(node) || node.shadowRoot == null) {
            return;
        }
        const shadowObserver = new MutationObserver(handleMutations);
        shadowObserver.observe(node.shadowRoot, mutationObserverOptions);
        shadowObservers.add(shadowObserver);
        nodesShadowObservers.set(node, shadowObserver);
    }

    const mutationObserverOptions = {childList: true, subtree: true, attributes: true, attributeFilter: ['rel', 'disabled']};
    observer = new MutationObserver(handleMutations);
    observer.observe(document.documentElement, mutationObserverOptions);
    iterateShadowNodes(document.documentElement, subscribeForShadowRootChanges);

    watchWhenCustomElementsDefined((hosts) => {
        const newStyles = getAllManageableStyles(hosts.map((h) => h.shadowRoot));
        update({created: newStyles, updated: [], removed: [], moved: []});
        hosts.forEach((h) => subscribeForShadowRootChanges(h));
    });
    collectUndefinedElements(document);
}

export function stopWatchingForStyleChanges() {
    if (observer) {
        observer.disconnect();
        observer = null;
        unsubscribeFromShadowRootChanges();
        unsubscribeFromDefineCustomElements();
    }
}
