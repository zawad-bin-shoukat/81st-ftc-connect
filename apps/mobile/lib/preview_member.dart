/// Fictional records for exploring the interface before the member API exists.
class PreviewMember {
  const PreviewMember({
    required this.name,
    required this.ftcId,
    required this.section,
    required this.cadre,
    required this.bcsBatch,
    required this.education,
    required this.university,
    required this.phone,
    required this.email,
    required this.bloodGroup,
    required this.homeDistrict,
    this.aboutMe = '',
    this.favouriteQuotation = '',
  });

  final String name;
  final String ftcId;
  final String section;
  final String cadre;
  final String bcsBatch;
  final String education;
  final String university;
  final String phone;
  final String email;
  final String bloodGroup;
  final String homeDistrict;
  final String aboutMe;
  final String favouriteQuotation;
}

const previewMembers = [
  PreviewMember(
    name: 'Example Member A',
    ftcId: 'Example 01',
    section: 'A',
    cadre: 'Administration',
    bcsBatch: '43rd',
    education: 'Example degree',
    university: 'Example University',
    phone: 'Example contact',
    email: 'example.a@example.com',
    bloodGroup: 'A+',
    homeDistrict: 'Example District',
    aboutMe: 'This is a fictional profile for interface preview.',
  ),
  PreviewMember(
    name: 'Example Member B',
    ftcId: 'Example 02',
    section: 'B',
    cadre: 'Police',
    bcsBatch: 'Unknown',
    education: 'Example degree',
    university: 'Example University',
    phone: 'Example contact',
    email: 'example.b@example.com',
    bloodGroup: 'B+',
    homeDistrict: 'Example District',
  ),
  PreviewMember(
    name: 'Example Member C',
    ftcId: 'Example 03',
    section: 'A',
    cadre: 'Foreign Affairs',
    bcsBatch: '44th',
    education: 'Example degree',
    university: 'Example University',
    phone: 'Example contact',
    email: 'example.c@example.com',
    bloodGroup: 'O+',
    homeDistrict: 'Example District',
  ),
];
