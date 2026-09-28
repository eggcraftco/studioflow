"use client";

import { createContext } from "react";

// True inside a mounted app shell. A nested <AppShell> then renders only its
// children (the shell is already on screen), and LoadingScreen shows a page's
// own wait in the content column instead of covering the shell. Its own module
// so LoadingScreen, which the login and callback pages use too, does not pull
// in the whole shell.
export const AppShellMountedContext = createContext(false);
