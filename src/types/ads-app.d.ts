declare namespace GoogleAds {
  interface AdsApp extends GoogleAdsScripts.AdsApp.AdsApp {
    mutateAll(operations: MutateOperation[]): MutateResult[];
  }

  /**
   * Represents the result of a single mutate operation.
   * https://developers.google.com/google-ads/scripts/docs/reference/adsapp/adsapp_mutateresult
   */
  interface MutateResult {
    getErrorMessages(): string[];
    getResourceName(): string;
    isSuccessful(): boolean;
  }

  type MutateOperation =
    | CampaignOperation
    | BiddingStrategyOperation
    | AdGroupOperation;

  interface BiddingStrategyOperation {
    biddingStrategyOperation: {
      updateMask: string;
      update: {
        resourceName: string;
        maximizeConversionValue?: {
          targetRoas: number;
        };
        maximizeConversions?: {
          targetCpaMicros: number;
        };
        targetRoas?: {
          targetRoas: number;
        };
        targetCpa?: {
          targetCpaMicros: number;
        };
      };
    };
  }

  interface CampaignOperation {
    campaignOperation: {
      updateMask: string;
      update: {
        resourceName: string;
        maximizeConversionValue?: {
          targetRoas: number;
        };
        maximizeConversions?: {
          targetCpaMicros: number;
        };
        targetRoas?: {
          targetRoas: number;
        };
        targetCpa?: {
          targetCpaMicros: number;
        };
      };
    };
  }

  interface AdGroupOperation {
    adGroupOperation: {
      updateMask: string;
      update: {
        resourceName: string;
        targetRoas?: number;
        targetCpaMicros?: number;
      };
    };
  }
}

declare let AdsApp: GoogleAds.AdsApp;
