export {};

declare global {
  type AladinCatalogOptions = Record<string, unknown>;

  interface AladinCatalog {
    name?: string;
    addSources(sources: AladinSource[]): void;
    removeAll(): void;
  }

  interface AladinSource {
    ra: number;
    dec: number;
    data?: Record<string, unknown>;
    deselect?: () => void;
    getCatalog?: () => AladinCatalog | null;
    select?: () => void;
  }

  interface AladinInstance {
    addCatalog(catalog: AladinCatalog): void;
    aladinDiv?: EventTarget;
    gotoRaDec(ra: number, dec: number): void;
    isInFullscreen?: boolean;
    on(eventName: "objectClicked", handler: (source: AladinSource | null) => void): void;
  }

  interface AladinApi {
    init?: Promise<unknown>;
    aladin(container: HTMLElement, options: AladinCatalogOptions): AladinInstance;
    catalog(options: AladinCatalogOptions): AladinCatalog;
    catalogFromURL(
      url: string,
      options?: AladinCatalogOptions,
      successCallback?: () => void,
    ): AladinCatalog | undefined;
    source(ra: number, dec: number, data?: Record<string, unknown>): AladinSource;
  }

  interface Window {
    A?: AladinApi;
  }
}
