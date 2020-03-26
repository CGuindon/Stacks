namespace Stacks {
    export abstract class BasePopoverController extends StacksController {

        private popper?: Popper.Instance;

        protected popoverElement!: HTMLElement;

        protected referenceElement!: HTMLElement;

        /**
         * An attribute containing the ID of the popover element to render, e.g. aria-controls or aria-describedby.
         */
        protected abstract popoverSelectorAttribute: string;

        /**
         * Binds events to the document on element show
         */
        protected abstract bindDocumentEvents(): void;

        /**
         * Unbinds events on the document on element hide
         */
        protected abstract unbindDocumentEvents(): void;

        /**
         * Returns true if the if the popover is currently visible.
         */
        get isVisible() {
            var popoverElement = this.popoverElement;
            return popoverElement ? popoverElement.classList.contains("is-visible") : false;
        }

        /**
         * Initializes and validates controller variables
         */
        connect() {
            super.connect();
            this.validate();

            // If the popover is visible, we bypass the failable `show` event and finish wiring things up
            if (this.isVisible) {
                this.finishShow();
            } else if (this.data.get("auto-show") === "true") {
                this.show();
            }

            this.data.delete("auto-show");
        }

        /**
         * Cleans up popper.js elements and disconnects all added event listeners
         */
        disconnect() {
            this.hide();
            if (this.popper) {
                this.popper.destroy();
                delete this.popper;
            }
            super.disconnect();
        }

        /**
         * Toggles the visibility of the popover
         */
        toggle() {
            this.isVisible ? this.hide() : this.show();
        }

        /**
         * Shows the popover if not already visible
         */
        show() {
            if (this.isVisible) { return; }

            if (this.triggerEvent("show").defaultPrevented) { return; }

            this.finishShow();
        }

        /**
         * Finishes showing the popover, regardless of whether the popover was already visible
         */
        finishShow() {

            if (!this.popper) {
                this.initializePopper();
            }

            this.popoverElement!.classList.add("is-visible");

            // ensure the popper has been positioned correctly
            this.scheduleUpdate();

            this.shown();
        }

        /**
         * Hides the popover if not already hidden
         */
        hide() {
            if (!this.isVisible) { return; }

            if (this.triggerEvent("hide").defaultPrevented) { return; }

            this.popoverElement.classList.remove("is-visible");

            if (this.popper) {
                // completely destroy the popper on hide; this is in line with Popper.js's performance recommendations
                this.popper.destroy();
                delete this.popper;
            }

            this.hidden();
        }

        /**
         * Binds document events for this popover and fires the shown event
         */
        protected shown() {
            this.bindDocumentEvents();
            this.triggerEvent("shown");
        }

        /**
         * Unbinds document events for this popover and fires the hidden event
         */
        protected hidden() {
            this.unbindDocumentEvents();
            this.triggerEvent("hidden");
        }

        /**
         * Generates the popover if not found during initialization
         */
        protected generatePopover(): HTMLElement | null {
            return null;
        }

        /**
         * Initializes the Popper for this instance
         */
        private initializePopper() {
            this.popper = Popper.createPopper(this.referenceElement, this.popoverElement, {
                placement: <Popper.Placement | null>this.data.get("placement") || "bottom",
                modifiers: [
                    {
                        name: "offset",
                        options: {
                            // Popperjs does not respect margins on the element, so set the offset here
                            // NOTE: this value matches the CSS value of auto-placed popovers margins (@su8 + 2)
                            offset: [0, 10]
                        }
                    }
                ]
            });
        }

        /**
         * Validates the popover settings and attempts to set necessary internal variables
         */
        private validate() {
            var referenceSelector = this.data.get("reference-selector");

            this.referenceElement = <HTMLElement>this.element;

            // if there is an alternative reference selector and that element exists, use it (and throw if it isn't found)
            if (referenceSelector) {
                this.referenceElement = <HTMLElement>this.element.querySelector(referenceSelector);

                if (!this.referenceElement) {
                    throw "Unable to find element by reference selector: " + referenceSelector;
                }
            }

            const popoverId = this.referenceElement.getAttribute(this.popoverSelectorAttribute);

            var popoverElement = null;

            // if the popover is named, attempt to fetch it (and throw an error if it doesn't exist)
            if (popoverId) {
                popoverElement = document.getElementById(popoverId);

                if (!popoverElement){
                    throw `[${this.popoverSelectorAttribute}="{POPOVER_ID}"] required`;
                }
            }
            // if the popover isn't named, attempt to generate it
            else {
                popoverElement = this.generatePopover();
            }

            if (!popoverElement) {
                throw "unable to find or generate popover element";
            }

            this.popoverElement = popoverElement;
        }

        /**
         * Schedules the popover to update on the next animation frame if visible
         */
        protected scheduleUpdate() {
            if (this.popper && this.isVisible) {
                this.popper.update();
            }
        }
    }

    export class PopoverController extends BasePopoverController {
        static targets = [];

        protected popoverSelectorAttribute = "aria-controls";

        private boundHideOnOutsideClick!: any;
        private boundHideOnEscapePress!: any;

        /**
         * Toggles optional classes in addition to BasePopoverController.shown
         */
        protected shown() {
            this.toggleOptionalClasses(true);
            super.shown();
        }

        /**
         * Toggles optional classes in addition to BasePopoverController.hidden
         */
        protected hidden() {
            this.toggleOptionalClasses(false);
            super.hidden();
        }

        /**
         * Binds global events to the document for hiding popovers on user interaction
         */
        protected bindDocumentEvents() {
            this.boundHideOnOutsideClick = this.boundHideOnOutsideClick || this.hideOnOutsideClick.bind(this);
            this.boundHideOnEscapePress = this.boundHideOnEscapePress || this.hideOnEscapePress.bind(this);

            document.addEventListener("click", this.boundHideOnOutsideClick);
            document.addEventListener("keyup", this.boundHideOnEscapePress);
        }

        /**
         * Unbinds global events to the document for hiding popovers on user interaction
         */
        protected  unbindDocumentEvents() {
            document.removeEventListener("click", this.boundHideOnOutsideClick);
            document.removeEventListener("keyup", this.boundHideOnEscapePress);
        }

        /**
         * Forces the popover to hide if a user clicks outside of it or its reference element
         * @param {Event} e - The document click event
         */
        private hideOnOutsideClick(e: MouseEvent) {
            const target = <Node>e.target;

            const behavior = this.data.get("hide-on-ouside-click");

            var shouldHide = behavior !== "false";

            // check if the document was clicked inside either the reference element or the popover itself
            // note: .contains also returns true if the node itself matches the target element
            if (shouldHide && !this.referenceElement.contains(target) && !this.popoverElement!.contains(target)) {
                this.hide();
            }
        }

        /**
         * Forces the popover to hide if the user presses escape while it, one of its childen, or the reference element are focused
         * @param {Event} e - The document keyup event 
         */
        private hideOnEscapePress(e: KeyboardEvent) {
            // if the ESC key (27) wasn't pressed or if no popovers are showing, return
            if (e.which !== 27 || !this.isVisible) {
                return;
            }

            // check if the target was inside the popover element and refocus the triggering element
            // note: .contains also returns true if the node itself matches the target element
            if (this.popoverElement!.contains(<Node>e.target)) {
                this.referenceElement.focus();
            }

            this.hide();
        }

        /**
         * Toggles all classes on the originating element based on the `class-toggle` data
         * @param {boolean=} show - A boolean indicating whether this is being triggered by a show or hide.
         */
        private toggleOptionalClasses(show?: boolean) {
            if (!this.data.has("toggle-class")) {
                return;
            }
            var cl = this.referenceElement.classList;
            this.data.get("toggle-class")!.split(/\s+/).forEach(function (cls: string) {
                cl.toggle(cls, show);
            });
        }
    }

    /**
     * Gets the current state of an element that may be or is intended to be an s-popover controller
     * so it can be configured either directly or via the DOM.
     * @param element An element that may have `data-controller="s-popover"`.
     * @returns A tuple containing four components:
     *          1. A boolean indicating whether or not the element has s-popover in its `data-controller` class.
     *          2. The element's existing `PopoverController` or null it it has not been configured yet.
     *          3. The popover's reference element as would live in `referenceSelector` or null if invalid.
     *          4. The popover currently associated with the controller, or null if one does not exist in the DOM.
     */
    function getPopover(element: Element) : [boolean, PopoverController | null, Element | null, Element | null] {
        const isPopover = getControllerList(element).contains("s-popover");
        const controller = Stacks.application.getControllerForElementAndIdentifier(element, "s-popover") as PopoverController | null;
        const referenceSelector = element.getAttribute("data-s-popover-reference-selector");
        const referenceElement = referenceSelector ? element.querySelector(referenceSelector) : element;
        const popoverId = referenceElement ? referenceElement.getAttribute("aria-controls") : null;
        const popover = popoverId ? document.getElementById(popoverId) : null;
        return [isPopover, controller, referenceElement, popover];
    }

    /**
     * Helper to manually show an s-popover element via external JS
     * @param element the element the `data-controller="s-popover"` attribute is on
     */
    export function showPopover(element: Element) {
        const [isPopover, controller, _] = getPopover(element);

        if (controller) {
            controller.show();
        } else if (isPopover) {
            element.setAttribute("data-s-popover-auto-show", "true");
        } else {
            throw `element does not have data-controller="s-popover"`;
        }
    }

    /**
     * Helper to manually hide an s-popover element via external JS
     * @param element the element the `data-controller="s-popover"` attribute is on
     */
    export function hidePopover(element: Element) {
        const [isPopover, controller, _, popover] = getPopover(element);

        if (controller) {
            controller.hide();
        } else if (isPopover) {
            element.removeAttribute("data-s-popover-auto-show");
            if (popover) {
                popover.classList.remove("is-visible");
            }
        } else {
            throw `element does not have data-controller="s-popover"`;
        }
    }

    /**
     * Options to use when attaching a popover via `Stacks.attachPopover`.
     * @see Stacks.attachPopover
     */
    export interface PopoverOptions {
        /**
         * When true, the `click->s-popover#toggle` action will be attached to the controller element or reference element.
         */
        toggleOnClick?: boolean;
        /**
         * When set, `data-s-popover-placement` will be set to this value on the controller element.
         */
        placement?: string;

        /**
         * When true, the popover will appear immediately when the controller connects.
         */
        autoShow?: boolean;
    }

    /**
     * Attaches a popover to an element and performs additional configuration.
     * @param element the element that will receive the `data-controller="s-popover"` attribute.
     * @param popover an element with the `.s-popover` class or HTML string containing a single element with the `.s-popover` class.
     *                If the popover does not have a parent element, it will be inserted as a immediately after the reference element.
     * @param options an optional collection of options to use when configuring the popover.
     */
    export function attachPopover(element: Element, popover: Element | string, options?: PopoverOptions)
    {
        const [isPopover, controller, referenceElement, existingPopover] = getPopover(element);

        if (existingPopover) {
            throw `element already has popover with id="${existingPopover.id}"`
        }

        if (!referenceElement) {
            throw `element has invalid data-s-popover-reference-selector attribute`
        }

        if (typeof popover === 'string') {
            const elements = document.createRange().createContextualFragment(popover).children;
            if (elements.length !== 1) {
                throw "popover should contain a single element";
            }
            popover = elements[0];
        }

        const existingId = referenceElement.getAttribute("aria-controls");
        var popoverId = popover.id;

        if (!popover.classList.contains('s-popover')) {
            throw `popover should have the "s-popover" class but had class="${popover.className}"`;
        }

        if (existingId && existingId !== popoverId) {
            throw `element has aria-controls="${existingId}" but popover has id="${popoverId}"`;
        }

        if (!popoverId) {
            popoverId = "--stacks-s-popover-" + Math.random().toString(36).substring(2, 10);
            popover.id = popoverId;
        }

        if (!existingId) {
            referenceElement.setAttribute("aria-controls", popoverId);
        }

        if (!popover.parentElement && element.parentElement) {
            referenceElement.insertAdjacentElement("afterend", popover);
        }

        getControllerList(element).add("s-popover");

        if (options) {
            if (options.toggleOnClick) {
                getActionList(referenceElement).add("click->s-popover#toggle");
            }
            if (options.placement) {
                element.setAttribute("data-s-popover-placement", options.placement);
            }
            if (options.autoShow) {
                element.setAttribute("data-s-popover-auto-show", "true");
            }
        }
    }

    /**
     * Removes the popover controller from an element and removes the popover from the DOM.
     * @param element the element that has the `data-controller="s-popover"` attribute.
     * @returns The popover that was attached to the element.
     */
    export function detachPopover(element: Element) {
        const [isPopover, controller, referenceElement, popover] = getPopover(element);

        // Hide the popover so its events fire.
        if (controller) { controller.hide(); }

        // Remove the popover if it exists
        if (popover) { popover.remove(); }

        // Remove the popover controller and the aria-controls attributes.
        if (isPopover) {
            getControllerList(element).remove("s-popover");
            if (referenceElement) {
                referenceElement.removeAttribute("aria-controls");
            }
        }

        return popover;
    }
}

Stacks.application.register("s-popover", Stacks.PopoverController);
