/** Adapter boundary only. No hospital HIS connection is included. */
export interface HospitalPrescriptionAdapter {
  readonly source: string;
  importPrescription(message: string): Promise<{
    externalId: string;
    doctorName: string;
    patientName: string;
    patientPhone?: string;
    items: {
      genericName: string;
      strength: string;
      form: string;
      quantity: string;
      dispenseAsWritten: boolean;
    }[];
  }>;
}
