interface Features {
    enable_source_link: boolean;
}

export interface Origins {
    owner: string;
    repo: string;
    ref ?: string;
}

export interface ConfigType {
    origins: Origins[];
    target: string;
    features: Features;
}

export interface FilePath {
    name: string;
    directory: string;
    saved: boolean;
  }
