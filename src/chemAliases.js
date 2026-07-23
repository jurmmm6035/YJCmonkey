// ---------- 化學式 / 縮寫搜尋對照表 ----------
// 讓使用者可以直接打化學式或常見縮寫（例如 K2CO3、dppf、TBAF）搜尋到資料庫裡
// 用正式英文名稱登記的試劑（例如 "Potassium Carbonate"）。
//
// 資料格式：{ abbr: "縮寫/化學式", keywords: ["會出現在試劑名稱裡的英文關鍵字", ...] }
// - abbr 只需要打「前綴」就會比對到（例如打 "K2C" 就能比對到 "K2CO3"）
// - keywords 是拿來反查資料庫 name 欄位用的子字串（小寫比對）
//
// 同一個 keyword 可以被多個 abbr 對應到（例如 dppf 本體 與 PdCl2(dppf) 觸媒）。

export const CHEM_ALIASES = [
  // ---- 常見無機鹽 / 鹼類 ----
  { abbr: "K2CO3", keywords: ["potassium carbonate"] },
  { abbr: "Na2CO3", keywords: ["sodium carbonate"] },
  { abbr: "Cs2CO3", keywords: ["cesium carbonate", "caesium carbonate"] },
  { abbr: "NaOH", keywords: ["sodium hydroxide"] },
  { abbr: "KOH", keywords: ["potassium hydroxide"] },
  { abbr: "LiOH", keywords: ["lithium hydroxide"] },
  { abbr: "Ba(OH)2", keywords: ["barium hydroxide"] },
  { abbr: "NaHCO3", keywords: ["sodium bicarbonate", "sodium hydrogen carbonate"] },
  { abbr: "KHCO3", keywords: ["potassium bicarbonate", "potassium hydrogen carbonate"] },
  { abbr: "K3PO4", keywords: ["potassium phosphate tribasic", "tripotassium phosphate"] },
  { abbr: "K2HPO4", keywords: ["potassium phosphate dibasic", "dipotassium hydrogen phosphate"] },
  { abbr: "Na3PO4", keywords: ["sodium phosphate tribasic", "trisodium phosphate"] },
  { abbr: "NaOAc", keywords: ["sodium acetate"] },
  { abbr: "KOAc", keywords: ["potassium acetate"] },
  { abbr: "NaOtBu", keywords: ["sodium tert-butoxide", "sodium t-butoxide"] },
  { abbr: "KOtBu", keywords: ["potassium tert-butoxide", "potassium t-butoxide"] },
  { abbr: "NaH", keywords: ["sodium hydride"] },
  { abbr: "CaH2", keywords: ["calcium hydride"] },
  { abbr: "CaCO3", keywords: ["calcium carbonate"] },
  { abbr: "CaCl2", keywords: ["calcium chloride"] },
  { abbr: "CaSO4", keywords: ["calcium sulfate"] },
  { abbr: "MgSO4", keywords: ["magnesium sulfate", "magnesium sulphate"] },
  { abbr: "Na2SO4", keywords: ["sodium sulfate", "sodium sulphate"] },
  { abbr: "NaCl", keywords: ["sodium chloride"] },
  { abbr: "KCl", keywords: ["potassium chloride"] },
  { abbr: "LiCl", keywords: ["lithium chloride"] },
  { abbr: "LiBr", keywords: ["lithium bromide"] },
  { abbr: "NaI", keywords: ["sodium iodide"] },
  { abbr: "KI", keywords: ["potassium iodide"] },
  { abbr: "NaN3", keywords: ["sodium azide"] },
  { abbr: "NaOCl", keywords: ["sodium hypochlorite"] },
  { abbr: "NH4Cl", keywords: ["ammonium chloride"] },
  { abbr: "NH4OAc", keywords: ["ammonium acetate"] },
  { abbr: "(NH4)2SO4", keywords: ["ammonium sulfate"] },
  { abbr: "H2O2", keywords: ["hydrogen peroxide"] },
  { abbr: "Oxone", keywords: ["oxone", "potassium peroxymonosulfate"] },

  // ---- 有機鹼 / 胺類 ----
  { abbr: "Et3N", keywords: ["triethylamine"] },
  { abbr: "TEA", keywords: ["triethylamine"] },
  { abbr: "DIPEA", keywords: ["diisopropylethylamine", "hunig", "n,n-diisopropylethylamine"] },
  { abbr: "Hunig's base", keywords: ["diisopropylethylamine", "hunig"] },
  { abbr: "DMAP", keywords: ["dimethylaminopyridine"] },
  { abbr: "DBU", keywords: ["diazabicyclo", "dbu"] },
  { abbr: "DABCO", keywords: ["diazabicyclo[2.2.2]octane", "dabco"] },
  { abbr: "TMEDA", keywords: ["tetramethylethylenediamine"] },
  { abbr: "Pyridine", keywords: ["pyridine"] },
  { abbr: "Imidazole", keywords: ["imidazole"] },
  { abbr: "Piperidine", keywords: ["piperidine"] },
  { abbr: "Morpholine", keywords: ["morpholine"] },

  // ---- 強鹼 / 金屬有機鹼 ----
  { abbr: "n-BuLi", keywords: ["n-butyllithium", "butyllithium"] },
  { abbr: "t-BuLi", keywords: ["tert-butyllithium", "t-butyllithium"] },
  { abbr: "s-BuLi", keywords: ["sec-butyllithium", "s-butyllithium"] },
  { abbr: "MeLi", keywords: ["methyllithium"] },
  { abbr: "LDA", keywords: ["lithium diisopropylamide"] },
  { abbr: "LiHMDS", keywords: ["lithium hexamethyldisilazide", "lithium bis(trimethylsilyl)amide"] },
  { abbr: "NaHMDS", keywords: ["sodium hexamethyldisilazide", "sodium bis(trimethylsilyl)amide"] },
  { abbr: "KHMDS", keywords: ["potassium hexamethyldisilazide", "potassium bis(trimethylsilyl)amide"] },

  // ---- 還原劑 ----
  { abbr: "LiAlH4", keywords: ["lithium aluminum hydride", "lithium aluminium hydride"] },
  { abbr: "NaBH4", keywords: ["sodium borohydride"] },
  { abbr: "NaBH(OAc)3", keywords: ["sodium triacetoxyborohydride"] },
  { abbr: "NaCNBH3", keywords: ["sodium cyanoborohydride"] },
  { abbr: "DIBAL", keywords: ["diisobutylaluminum hydride", "diisobutylaluminium hydride"] },
  { abbr: "DIBAL-H", keywords: ["diisobutylaluminum hydride", "diisobutylaluminium hydride"] },
  { abbr: "Zn dust", keywords: ["zinc dust", "zinc powder"] },
  { abbr: "H2", keywords: ["hydrogen gas"] },

  // ---- 氧化劑 ----
  { abbr: "mCPBA", keywords: ["chloroperoxybenzoic acid", "meta-chloroperoxybenzoic"] },
  { abbr: "PCC", keywords: ["pyridinium chlorochromate"] },
  { abbr: "PDC", keywords: ["pyridinium dichromate"] },
  { abbr: "DMP", keywords: ["dess-martin", "dess martin periodinane"] },
  { abbr: "IBX", keywords: ["iodoxybenzoic acid"] },
  { abbr: "DDQ", keywords: ["dichloro-5,6-dicyano-1,4-benzoquinone", "dichlorodicyanobenzoquinone"] },
  { abbr: "TEMPO", keywords: ["tempo", "tetramethylpiperidin"] },
  { abbr: "NMO", keywords: ["n-methylmorpholine n-oxide"] },
  { abbr: "OsO4", keywords: ["osmium tetroxide"] },
  { abbr: "KMnO4", keywords: ["potassium permanganate"] },
  { abbr: "Selectfluor", keywords: ["selectfluor"] },
  { abbr: "NFSI", keywords: ["n-fluorobenzenesulfonimide"] },

  // ---- 鹵化 / 親電試劑 ----
  { abbr: "NBS", keywords: ["n-bromosuccinimide", "bromosuccinimide"] },
  { abbr: "NCS", keywords: ["n-chlorosuccinimide", "chlorosuccinimide"] },
  { abbr: "NIS", keywords: ["n-iodosuccinimide", "iodosuccinimide"] },
  { abbr: "SOCl2", keywords: ["thionyl chloride"] },
  { abbr: "POCl3", keywords: ["phosphorus oxychloride", "phosphoryl chloride"] },
  { abbr: "PBr3", keywords: ["phosphorus tribromide"] },
  { abbr: "PCl5", keywords: ["phosphorus pentachloride"] },
  { abbr: "(COCl)2", keywords: ["oxalyl chloride"] },
  { abbr: "I2", keywords: ["iodine"] },
  { abbr: "Br2", keywords: ["bromine"] },
  { abbr: "NaOCl", keywords: ["sodium hypochlorite"] },

  // ---- 酸類 / 保護基相關 ----
  { abbr: "TFA", keywords: ["trifluoroacetic acid"] },
  { abbr: "AcOH", keywords: ["acetic acid"] },
  { abbr: "Ac2O", keywords: ["acetic anhydride"] },
  { abbr: "TfOH", keywords: ["trifluoromethanesulfonic acid", "triflic acid"] },
  { abbr: "Tf2O", keywords: ["trifluoromethanesulfonic anhydride", "triflic anhydride"] },
  { abbr: "TMSCl", keywords: ["trimethylsilyl chloride"] },
  { abbr: "TMSOTf", keywords: ["trimethylsilyl trifluoromethanesulfonate", "trimethylsilyl triflate"] },
  { abbr: "TBSCl", keywords: ["tert-butyldimethylsilyl chloride"] },
  { abbr: "TBSOTf", keywords: ["tert-butyldimethylsilyl trifluoromethanesulfonate", "tert-butyldimethylsilyl triflate"] },
  { abbr: "Boc2O", keywords: ["di-tert-butyl dicarbonate", "boc anhydride"] },
  { abbr: "Cbz-Cl", keywords: ["benzyl chloroformate"] },
  { abbr: "Fmoc-Cl", keywords: ["fmoc chloride", "fluorenylmethyloxycarbonyl chloride"] },

  // ---- 偶聯試劑 (peptide/amide coupling) ----
  { abbr: "EDC", keywords: ["ethyl-3-(3-dimethylaminopropyl)carbodiimide", "edc"] },
  { abbr: "EDCI", keywords: ["ethyl-3-(3-dimethylaminopropyl)carbodiimide", "edci"] },
  { abbr: "DCC", keywords: ["dicyclohexylcarbodiimide"] },
  { abbr: "DIC", keywords: ["diisopropylcarbodiimide"] },
  { abbr: "HATU", keywords: ["hatu"] },
  { abbr: "HBTU", keywords: ["hbtu"] },
  { abbr: "TBTU", keywords: ["tbtu"] },
  { abbr: "HOBt", keywords: ["hydroxybenzotriazole"] },
  { abbr: "HOAt", keywords: ["hydroxy-7-azabenzotriazole", "hoat"] },
  { abbr: "DIAD", keywords: ["diisopropyl azodicarboxylate"] },
  { abbr: "DEAD", keywords: ["diethyl azodicarboxylate"] },

  // ---- Pd 觸媒 ----
  { abbr: "Pd(PPh3)4", keywords: ["tetrakis(triphenylphosphine)palladium"] },
  { abbr: "Pd(OAc)2", keywords: ["palladium(ii) acetate", "palladium acetate"] },
  { abbr: "Pd2(dba)3", keywords: ["tris(dibenzylideneacetone)dipalladium"] },
  { abbr: "Pd(dba)2", keywords: ["bis(dibenzylideneacetone)palladium"] },
  { abbr: "PdCl2(dppf)", keywords: ["bis(diphenylphosphino)ferrocene]dichloropalladium", "dppf)dichloropalladium", "dppf)palladium(ii) dichloride"] },
  { abbr: "Pd(dppf)Cl2", keywords: ["bis(diphenylphosphino)ferrocene]dichloropalladium", "dppf)dichloropalladium", "dppf)palladium(ii) dichloride"] },
  { abbr: "PdCl2(PPh3)2", keywords: ["bis(triphenylphosphine)palladium(ii) dichloride"] },
  { abbr: "Pd(PtBu3)2", keywords: ["bis(tri-tert-butylphosphine)palladium"] },
  { abbr: "Pd/C", keywords: ["palladium on carbon", "palladium/carbon"] },
  { abbr: "Pd(OH)2/C", keywords: ["palladium hydroxide on carbon", "pearlman"] },
  { abbr: "PdCl2", keywords: ["palladium(ii) chloride", "palladium chloride"] },
  { abbr: "Pd(TFA)2", keywords: ["palladium(ii) trifluoroacetate"] },
  { abbr: "PEPPSI", keywords: ["peppsi"] },

  // ---- 配體 ----
  { abbr: "dppf", keywords: ["diphenylphosphino)ferrocene"] },
  { abbr: "dppe", keywords: ["bis(diphenylphosphino)ethane"] },
  { abbr: "dppp", keywords: ["bis(diphenylphosphino)propane"] },
  { abbr: "dppb", keywords: ["bis(diphenylphosphino)butane"] },
  { abbr: "BINAP", keywords: ["binaphthyl", "binap"] },
  { abbr: "Xantphos", keywords: ["xantphos", "xanthene"] },
  { abbr: "XPhos", keywords: ["xphos"] },
  { abbr: "SPhos", keywords: ["sphos"] },
  { abbr: "RuPhos", keywords: ["ruphos"] },
  { abbr: "DavePhos", keywords: ["davephos"] },
  { abbr: "JohnPhos", keywords: ["johnphos"] },
  { abbr: "dtbpy", keywords: ["di-tert-butyl-2,2'-bipyridine", "bipyridine"] },
  { abbr: "PPh3", keywords: ["triphenylphosphine"] },
  { abbr: "PCy3", keywords: ["tricyclohexylphosphine"] },
  { abbr: "P(o-tol)3", keywords: ["tri(o-tolyl)phosphine"] },
  { abbr: "P(tBu)3", keywords: ["tri-tert-butylphosphine"] },

  // ---- Ag 鹽 ----
  { abbr: "AgNO3", keywords: ["silver nitrate"] },
  { abbr: "AgOAc", keywords: ["silver acetate"] },
  { abbr: "Ag2O", keywords: ["silver oxide", "silver(i) oxide"] },
  { abbr: "Ag2CO3", keywords: ["silver carbonate"] },
  { abbr: "AgOTf", keywords: ["silver trifluoromethanesulfonate", "silver triflate"] },
  { abbr: "AgBF4", keywords: ["silver tetrafluoroborate"] },
  { abbr: "AgSbF6", keywords: ["silver hexafluoroantimonate"] },
  { abbr: "AgF", keywords: ["silver fluoride"] },
  { abbr: "AgCl", keywords: ["silver chloride"] },

  // ---- Cu 鹽 ----
  { abbr: "CuI", keywords: ["copper(i) iodide", "cuprous iodide"] },
  { abbr: "CuBr", keywords: ["copper(i) bromide", "cuprous bromide"] },
  { abbr: "CuCl", keywords: ["copper(i) chloride", "cuprous chloride"] },
  { abbr: "CuCl2", keywords: ["copper(ii) chloride", "cupric chloride"] },
  { abbr: "CuBr2", keywords: ["copper(ii) bromide", "cupric bromide"] },
  { abbr: "Cu(OAc)2", keywords: ["copper(ii) acetate", "cupric acetate"] },
  { abbr: "CuSO4", keywords: ["copper(ii) sulfate", "copper sulfate", "cupric sulfate"] },
  { abbr: "CuOTf", keywords: ["copper trifluoromethanesulfonate", "copper triflate"] },
  { abbr: "Cu2O", keywords: ["copper(i) oxide", "cuprous oxide"] },
  { abbr: "CuO", keywords: ["copper(ii) oxide", "cupric oxide"] },
  { abbr: "Cu(acac)2", keywords: ["copper(ii) acetylacetonate"] },

  // ---- Ni 鹽 / 觸媒 ----
  { abbr: "NiCl2", keywords: ["nickel(ii) chloride", "nickel chloride"] },
  { abbr: "NiBr2", keywords: ["nickel(ii) bromide", "nickel bromide"] },
  { abbr: "NiCl2(dme)", keywords: ["nickel(ii) chloride ethylene glycol dimethyl ether", "nickel chloride dme"] },
  { abbr: "NiCl2(PPh3)2", keywords: ["bis(triphenylphosphine)nickel(ii) dichloride"] },
  { abbr: "Ni(cod)2", keywords: ["bis(1,5-cyclooctadiene)nickel"] },
  { abbr: "Ni(OAc)2", keywords: ["nickel(ii) acetate", "nickel acetate"] },
  { abbr: "Ni(acac)2", keywords: ["nickel(ii) acetylacetonate"] },
  { abbr: "NiSO4", keywords: ["nickel(ii) sulfate", "nickel sulfate"] },

  // ---- Zn 鹽 ----
  { abbr: "ZnCl2", keywords: ["zinc chloride"] },
  { abbr: "ZnBr2", keywords: ["zinc bromide"] },
  { abbr: "ZnI2", keywords: ["zinc iodide"] },
  { abbr: "Zn(OTf)2", keywords: ["zinc trifluoromethanesulfonate", "zinc triflate"] },
  { abbr: "ZnO", keywords: ["zinc oxide"] },
  { abbr: "ZnSO4", keywords: ["zinc sulfate"] },
  { abbr: "Zn(OAc)2", keywords: ["zinc acetate"] },

  // ---- 其他常見金屬鹽 / 路易士酸 ----
  { abbr: "BF3·OEt2", keywords: ["boron trifluoride diethyl etherate", "boron trifluoride etherate"] },
  { abbr: "AlCl3", keywords: ["aluminum chloride", "aluminium chloride"] },
  { abbr: "TiCl4", keywords: ["titanium tetrachloride", "titanium(iv) chloride"] },
  { abbr: "SnCl2", keywords: ["tin(ii) chloride", "stannous chloride"] },
  { abbr: "SnCl4", keywords: ["tin(iv) chloride", "stannic chloride"] },
  { abbr: "Sc(OTf)3", keywords: ["scandium trifluoromethanesulfonate", "scandium triflate"] },
  { abbr: "In(OTf)3", keywords: ["indium trifluoromethanesulfonate", "indium triflate"] },
  { abbr: "Yb(OTf)3", keywords: ["ytterbium trifluoromethanesulfonate", "ytterbium triflate"] },
  { abbr: "FeCl3", keywords: ["iron(iii) chloride", "ferric chloride"] },
  { abbr: "MnO2", keywords: ["manganese dioxide", "manganese(iv) oxide"] },
  { abbr: "RhCl3", keywords: ["rhodium(iii) chloride", "rhodium trichloride"] },
  { abbr: "RuCl3", keywords: ["ruthenium(iii) chloride", "ruthenium trichloride"] },
  { abbr: "IrCl3", keywords: ["iridium(iii) chloride", "iridium trichloride"] },

  // ---- 四級銨鹽 / 相轉移觸媒 ----
  { abbr: "TBAF", keywords: ["tetrabutylammonium fluoride", "tetra-n-butylammonium fluoride"] },
  { abbr: "TBAB", keywords: ["tetrabutylammonium bromide", "tetra-n-butylammonium bromide"] },
  { abbr: "TBAI", keywords: ["tetrabutylammonium iodide", "tetra-n-butylammonium iodide"] },
  { abbr: "TBACl", keywords: ["tetrabutylammonium chloride"] },
  { abbr: "TBAHS", keywords: ["tetrabutylammonium hydrogen sulfate", "tetrabutylammonium bisulfate"] },

  // ---- 常用溶劑 ----
  { abbr: "THF", keywords: ["tetrahydrofuran"] },
  { abbr: "DMF", keywords: ["dimethylformamide"] },
  { abbr: "DMSO", keywords: ["dimethyl sulfoxide", "dimethylsulfoxide"] },
  { abbr: "DCM", keywords: ["dichloromethane"] },
  { abbr: "MeOH", keywords: ["methanol"] },
  { abbr: "EtOH", keywords: ["ethanol"] },
  { abbr: "MeCN", keywords: ["acetonitrile"] },
  { abbr: "ACN", keywords: ["acetonitrile"] },
  { abbr: "EtOAc", keywords: ["ethyl acetate"] },
  { abbr: "Et2O", keywords: ["diethyl ether"] },
  { abbr: "Toluene", keywords: ["toluene"] },
  { abbr: "Hexane", keywords: ["hexane", "hexanes"] },
  { abbr: "DMAc", keywords: ["dimethylacetamide"] },
  { abbr: "NMP", keywords: ["methyl-2-pyrrolidone", "n-methylpyrrolidone"] },
  { abbr: "IPA", keywords: ["isopropanol", "2-propanol", "isopropyl alcohol"] },
  { abbr: "HMPA", keywords: ["hexamethylphosphoramide"] },
  { abbr: "Dioxane", keywords: ["dioxane"] },
  { abbr: "DME", keywords: ["dimethoxyethane"] },
  { abbr: "TFE", keywords: ["trifluoroethanol"] },
  { abbr: "HFIP", keywords: ["hexafluoroisopropanol", "hexafluoro-2-propanol"] },
  { abbr: "CHCl3", keywords: ["chloroform"] },
  { abbr: "CCl4", keywords: ["carbon tetrachloride"] },
  { abbr: "MTBE", keywords: ["methyl tert-butyl ether", "tert-butyl methyl ether"] },
  { abbr: "iPrOH", keywords: ["isopropanol", "2-propanol", "isopropyl alcohol"] },
  { abbr: "nBuOH", keywords: ["n-butanol", "butan-1-ol"] },
  { abbr: "tBuOH", keywords: ["tert-butanol", "tert-butyl alcohol"] },

  // ---- Boron / 交叉偶聯常用試劑 ----
  { abbr: "B2pin2", keywords: ["bis(pinacolato)diboron"] },
  { abbr: "Pinacol", keywords: ["pinacol"] },
  { abbr: "PinBH", keywords: ["pinacolborane"] },
  { abbr: "9-BBN", keywords: ["9-borabicyclo[3.3.1]nonane"] },
  { abbr: "B(OH)3", keywords: ["boric acid"] },
];

// 前綴比對最短長度：避免打 1 個字時比對到太多不相關的縮寫
const MIN_PREFIX_LEN = 2;

/**
 * 依輸入字串展開出所有可能對應的英文關鍵字（來自化學式/縮寫對照表）。
 * 只要輸入是某個縮寫的「前綴」就會命中（例如打 "K2C" 會比對到 "K2CO3"）。
 */
export function expandChemAliasKeywords(rawQuery) {
  const q = String(rawQuery || "").trim().toLowerCase();
  if (!q || q.length < MIN_PREFIX_LEN) return [];
  const keywords = new Set();
  for (const { abbr, keywords: kws } of CHEM_ALIASES) {
    const a = abbr.toLowerCase();
    if (a.startsWith(q) || q.startsWith(a)) {
      kws.forEach((k) => keywords.add(k));
    }
  }
  return [...keywords];
}

/**
 * 判斷一筆試劑資料是否符合搜尋字串：先比對名稱/CAS（及選用的其他欄位）的子字串，
 * 再比對化學式/縮寫對照表展開出的英文關鍵字。
 */
export function reagentMatchesQuery(entry, rawQuery, extraFields = []) {
  const q = String(rawQuery || "").trim().toLowerCase();
  if (!q) return true;

  const name = String(entry?.name || "").toLowerCase();
  if (name.includes(q)) return true;

  if (String(entry?.cas || "").toLowerCase().includes(q)) return true;

  for (const field of extraFields) {
    if (String(entry?.[field] || "").toLowerCase().includes(q)) return true;
  }

  const aliasKeywords = expandChemAliasKeywords(q);
  for (const keyword of aliasKeywords) {
    if (name.includes(keyword)) return true;
  }

  return false;
}
