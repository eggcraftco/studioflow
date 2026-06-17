// The Team Schedule view shares the entire data + range + filter pipeline with the
// regular Schedule page. The page component reads the pathname to switch into the
// member-grouped "team mode", so this route simply re-exports it.
export { default } from "../schedule/page";
