/**
 * Where the gallery fetches each size of a photograph from.
 *
 * Two families of routes on purpose: `/i/photo` is public and refuses
 * anything hidden, `/admin/photos` is behind the sign-in and does not, so
 * the couple can see what they hid in order to unhide it. Named by a
 * string rather than passed in as functions so a server component can
 * choose one.
 */
export type GallerySource = "album" | "planner";

export type PhotoSources = {
  thumb: (id: number) => string;
  full: (id: number) => string;
};

export function photoSources(source: GallerySource): PhotoSources {
  return source === "album"
    ? { thumb: (id) => `/i/photo/${id}/thumb`, full: (id) => `/i/photo/${id}` }
    : {
        thumb: (id) => `/admin/photos/${id}/thumb`,
        full: (id) => `/admin/photos/${id}/image`,
      };
}
