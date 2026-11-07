/**
 * True on a mouse or trackpad. On a phone, focusing a text field opens the keyboard, so pickers and search sheets only
 * focus their search box by themselves when this is true; on touch the person taps the box when they want to type.
 */
export const finePointer = (): boolean => typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches
