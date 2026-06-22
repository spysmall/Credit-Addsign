export interface TeamMember {
  id: string;
  fullName: string;
  nickname: string;
  role?: string;
  isLead?: boolean;
  excludeFromCredits?: boolean; // ปลาย
  customHoursPerMonth?: number; // สำหรับ Lead
}

export const TEAM_MEMBERS: TeamMember[] = [
  {
    id: "phat",
    fullName: "ภัสรา แซ่เอีย",
    nickname: "ภัส",
    role: "Lead",
    isLead: true,
    customHoursPerMonth: 48,
  },
  { id: "fern", fullName: "สุวนันท์ บุญแดง", nickname: "เฟิร์น" },
  { id: "dear", fullName: "ศรัณพงษ์ ชาวพรม", nickname: "เดียร์" },
  { id: "pip", fullName: "ภูริชญ์ นามแดง", nickname: "ปีพ" },
  { id: "fort", fullName: "ภูริทัต น้อยเหม่", nickname: "ฟอร์ต" },
  { id: "boss", fullName: "ฤทธิธรณ สนธิเมือง", nickname: "บอส" },
  { id: "tia", fullName: "ชินภัทร คล่องนาวา", nickname: "เตีย" },
  {
    id: "plaai",
    fullName: "กฤษณา อัศวเมษิน",
    nickname: "ปลาย",
    excludeFromCredits: true,
  },
];
