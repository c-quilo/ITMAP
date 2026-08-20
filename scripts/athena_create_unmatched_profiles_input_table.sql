CREATE EXTERNAL TABLE imperial_unmatched_profiles_input (
  ord int,
  researcher_id string,
  profile_url string,
  full_name string,
  orcid string,
  position_name string,
  position string,
  affiliation string,
  faculty string,
  fields_of_research string,
  profile_text string
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar' = ',',
  'quoteChar' = '"',
  'escapeChar' = '\\'
)
LOCATION 's3://openalex-june-2026/athena-inputs/openalex-unmatched-profiles/'
TBLPROPERTIES ('skip.header.line.count'='1')
