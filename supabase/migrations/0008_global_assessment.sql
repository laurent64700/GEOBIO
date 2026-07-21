alter table mission add column cause_architectural numeric check (cause_architectural between 0 and 10);
alter table mission add column cause_electromagnetique numeric check (cause_electromagnetique between 0 and 10);
alter table mission add column cause_geobiologique numeric check (cause_geobiologique between 0 and 10);
alter table mission add column cause_paranormale numeric check (cause_paranormale between 0 and 10);
alter table mission add column cause_autres numeric check (cause_autres between 0 and 10);
alter table mission add column bovis_rate numeric check (bovis_rate between 0 and 180000);
