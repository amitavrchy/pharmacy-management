import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
import {hashPassword} from '../src/auth/password';
import {dateUTC,shopDate} from '../src/common/domain';
import {maintenance} from '../src/jobs/maintenance';
import {Db} from '../src/db/prisma.service';
const db=new PrismaClient();
const catalog=[
 ['Paracetamol','Analgesic','Napa','Beximco','500 mg','OTC',120],['Paracetamol','Analgesic','Ace','Square','500 mg','OTC',120],
 ['Omeprazole','Gastrointestinal','Seclo','Square','20 mg','OTC',600],['Esomeprazole','Gastrointestinal','Maxpro','Renata','20 mg','OTC',700],
 ['Cetirizine','Antihistamine','Alatrol','Square','10 mg','OTC',300],['Fexofenadine','Antihistamine','Fexo','Square','120 mg','OTC',900],
 ['Amoxicillin','Antibiotic','Moxacil','Square','500 mg','RX',700],['Azithromycin','Antibiotic','Zimax','Square','500 mg','RX',3500],
 ['Metformin','Antidiabetic','Comet','Square','500 mg','RX',400],['Amlodipine','Cardiovascular','Amdocal','Beximco','5 mg','RX',500],
 ['Losartan','Cardiovascular','Angilock','Square','50 mg','RX',800],['Montelukast','Respiratory','Monas','ACME','10 mg','RX',1500],
 ['Domperidone','Gastrointestinal','Motigut','Square','10 mg','RX',350],['Zinc sulfate','Supplement','Zimax-Z','Demo Labs','20 mg','OTC',200],
 ['Calcium carbonate','Supplement','Calbo','Square','500 mg','OTC',500],['Vitamin C','Supplement','Ceevit','Square','250 mg','OTC',250],
 ['Pantoprazole','Gastrointestinal','Pantonix','Incepta','20 mg','OTC',600],['Salbutamol','Respiratory','Sultolin','Square','4 mg','RX',250],
 ['Clonazepam','Controlled','Rivotril','Radiant','0.5 mg','CONTROLLED',800],['Ibuprofen','Analgesic','Flamex','ACME','400 mg','OTC',400]
] as const;
async function seed(){
  if(!process.env.SEED_PASSWORD||process.env.SEED_PASSWORD.length<12)throw new Error('Set SEED_PASSWORD (12+ characters)');
  const shop=await db.shop.upsert({where:{id:'shop-demo'},create:{id:'shop-demo',name:'Medora Pharmacy',address:'Dhanmondi 27, Dhaka 1209',phone:'+880 1700 000000',drugLicenseNo:'DEMO-NOT-A-LICENSE'},update:{}});
  for(const [role,name]of [['OWNER','Amitav Roy Chowdhury'],['PHARMACIST','Nusrat Rahman'],['CASHIER','Rafi Ahmed'],['STORE_KEEPER','Sadia Islam'],['AUDITOR','Tanvir Hasan']]as const){await db.user.upsert({where:{email:`${role.toLowerCase()}@medora.local`},create:{name,email:`${role.toLowerCase()}@medora.local`,role,shopId:shop.id,passwordHash:hashPassword(process.env.SEED_PASSWORD)},update:{}});}
  for(let i=0;i<100;i++){
    const [genericName,therapeuticClass,base,manufacturer,strength,schedule,price]=catalog[i%catalog.length];
    const variant=Math.floor(i/catalog.length),brandName=variant?`${base} ${['','Plus','Forte','Care','Nova'][variant]}`:base;
    const generic=await db.generic.upsert({where:{name:genericName},create:{name:genericName,therapeuticClass},update:{}});
    const med=await db.medicine.upsert({where:{id:`med-${i+1}`},create:{id:`med-${i+1}`,shopId:shop.id,genericId:generic.id,brandName,manufacturer,strength,form:'Tablet',packSize:10,barcode:`880100${String(i+1).padStart(7,'0')}`,schedule,priceMinor:price+variant*50,reorderLevel:50},update:{}});
    for(let b=0;b<2;b++){
      const expiry=new Date(dateUTC().getTime()+(i%13===0&&!b?-10:20+i*4+b*180)*86400000);
      await db.stockBatch.upsert({where:{id:`batch-${i+1}-${b}`},create:{id:`batch-${i+1}-${b}`,shopId:shop.id,medicineId:med.id,lotNumber:`MD${String(i+1).padStart(3,'0')}${b?'B':'A'}`,expiryDate:expiry,qtyOnHand:i%9===0?12:160+b*100,costMinor:Math.floor(med.priceMinor*0.7),rack:`${String.fromCharCode(65+i%5)}-${i%8+1}`},update:{}});
    }
  }
  for(const [id,name] of [['supplier-1','Square Pharmaceuticals'],['supplier-2','Beximco Pharma'],['supplier-3','Incepta Distribution']]) await db.supplier.upsert({where:{id},create:{id,shopId:shop.id,name,phone:'+880 1800 000000',address:'Dhaka, Bangladesh'},update:{}});
  await db.prescription.upsert({where:{id:'rx-demo'},create:{id:'rx-demo',shopId:shop.id,rxNumber:`RX-${shopDate().replaceAll('-','')}-001`,doctorName:'Dr. Farhana Islam',patientName:'Rahim Uddin',patientPhone:'+880 1712 345678',items:{create:[{medicineId:'med-7',qtyPrescribed:21},{medicineId:'med-3',qtyPrescribed:14}]}},update:{}});
  await maintenance(db as Db);
  console.log('Seed ready: 100 fictional medicine SKUs, 200 batches, five role accounts. Not clinical or regulatory reference data.');
}
seed().finally(()=>db.$disconnect());
