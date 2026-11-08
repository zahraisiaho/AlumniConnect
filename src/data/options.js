// Controlled vocabulary: single source of truth for forms, filters and the matching rules.
// Keep in sync with the lookup tables in the database (seed.sql, then more_options.sql for the longer lists).
// Only ever add to these lists: renaming an entry breaks existing profiles, the seed data and the tests.
export const universities = [
  'Strathmore University', 'University of Nairobi', 'Kenyatta University', 'JKUAT', 'Moi University',
  'Makerere University', 'University of Dar es Salaam', 'University of Cape Town', 'University of Ghana',
  // Kenya
  'KCA University', 'USIU-Africa', 'Daystar University', 'Egerton University', 'Maseno University',
  'Technical University of Kenya', 'Mount Kenya University', 'Catholic University of Eastern Africa', 'Africa Nazarene University',
  'Multimedia University of Kenya', 'Dedan Kimathi University of Technology', 'Kenya Methodist University', 'Riara University',
  'Zetech University', 'Pwani University', 'Masinde Muliro University', 'Kisii University', 'Chuka University',
  'Laikipia University', 'Karatina University', 'Kabarak University', "St. Paul's University", 'Technical University of Mombasa',
  'Aga Khan University', 'Kirinyaga University', 'Meru University of Science and Technology', "Murang'a University of Technology",
  'Tangaza University', 'Co-operative University of Kenya', 'Maasai Mara University', 'Jaramogi Oginga Odinga University',
  'Machakos University', 'South Eastern Kenya University', 'Kibabii University', 'Rongo University', 'University of Embu',
  'Garissa University', 'Taita Taveta University', 'Pan Africa Christian University', 'Scott Christian University',
  // Rest of Africa
  'Kyambogo University', 'Uganda Christian University', 'Mbarara University of Science and Technology', 'Ardhi University',
  'Sokoine University of Agriculture', 'University of Rwanda', 'Addis Ababa University', 'University of Lagos',
  'University of the Witwatersrand', 'Stellenbosch University', 'University of Pretoria', 'African Leadership University',
]
export const fields = [
  'Computer Science', 'Information Technology', 'Software Engineering', 'Business Administration',
  'Finance & Accounting', 'Economics', 'Engineering', 'Law', 'Medicine & Health Sciences',
  'Education', 'Design & Media', 'Agriculture & Environment',
  'Data Science', 'Information Systems', 'Mathematics', 'Statistics & Actuarial Science', 'Physics', 'Chemistry',
  'Biology & Biochemistry', 'Biotechnology', 'Environmental Science', 'Civil Engineering', 'Electrical & Electronic Engineering',
  'Mechanical Engineering', 'Telecommunications Engineering', 'Architecture & Urban Planning', 'Nursing', 'Pharmacy',
  'Public Health', 'Dentistry', 'Veterinary Medicine', 'Food Science & Nutrition', 'Commerce', 'Marketing',
  'Human Resource Management', 'Procurement & Supply Chain', 'Hospitality & Tourism', 'Journalism & Mass Communication',
  'International Relations', 'Political Science', 'Psychology', 'Sociology', 'Social Work', 'Development Studies',
  'Languages & Literature', 'History', 'Theology & Religious Studies', 'Fine Art', 'Music & Performing Arts',
  'Film & Animation', 'Fashion Design', 'Aviation', 'Sports Science',
]
export const industries = [
  'Technology', 'Finance & Banking', 'Healthcare', 'Consulting', 'Education', 'Telecommunications',
  'Aviation & Logistics', 'Government & NGO', 'Creative & Media', 'Agriculture & Energy',
  'Fintech', 'Insurance', 'Accounting & Audit', 'Legal Services', 'Manufacturing', 'Real Estate & Construction',
  'Retail & E-commerce', 'FMCG & Consumer Goods', 'Hospitality & Tourism', 'Pharmaceuticals', 'Mining & Oil and Gas',
  'Renewable Energy', 'Marketing & Advertising', 'Human Resources & Recruitment', 'Research & Academia',
  'Environment & Conservation', 'Transport & Automotive', 'Security & Defence', 'Sports & Entertainment',
  'Fashion & Beauty', 'Water & Sanitation', 'International Development',
]
// Users can also type in skills that are not listed; the server adds those to the database as they are used.
export const skills = [
  'Python', 'JavaScript', 'React', 'SQL', 'Data analysis', 'Machine learning', 'Cybersecurity', 'Cloud',
  'UI/UX design', 'Project management', 'Public speaking', 'Financial modelling', 'Research', 'Leadership', 'Marketing',
  // Technology
  'Java', 'C++', 'C#', 'PHP', 'TypeScript', 'Node.js', 'Django', 'Flutter', 'Kotlin', 'Swift', 'Web development',
  'Mobile development', 'DevOps', 'AWS', 'Microsoft Azure', 'Networking', 'Linux', 'Deep learning', 'Data engineering', 'R', 'Git',
  // Data and design tools
  'Excel', 'Power BI', 'Tableau', 'Statistics', 'GIS', 'AutoCAD', '3D modelling',
  // Business
  'Accounting', 'Auditing', 'Taxation', 'Business analysis', 'Product management', 'Agile & Scrum', 'Sales',
  'Customer service', 'Supply chain management', 'Procurement', 'Human resources', 'Entrepreneurship', 'Fundraising',
  'Grant writing', 'Monitoring & evaluation', 'Policy analysis', 'Event planning',
  // Marketing and creative
  'Digital marketing', 'SEO', 'Social media management', 'Content writing', 'Copywriting', 'Graphic design',
  'Video editing', 'Photography',
  // Professional
  'Legal research', 'Contract drafting', 'Clinical skills', 'Laboratory techniques', 'Teaching', 'Mentoring',
  // People skills and languages
  'Communication', 'Negotiation', 'Teamwork', 'Critical thinking', 'Problem solving', 'Swahili', 'French',
]
export const interests = [
  'Career guidance', 'CV & interview prep', 'Internships abroad', 'Starting a business', 'Postgraduate study',
  'Technical skills', 'Leadership growth', 'Networking', 'Work-life balance',
]
export const availability = ['Weekday evenings', 'Weekends', 'Flexible', 'Once a month']
export const forumCategories = ['Career advice', 'Study & research', 'Jobs & internships', 'Entrepreneurship', 'General']
