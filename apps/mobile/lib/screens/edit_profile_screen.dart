import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import 'dart:typed_data';

import '../preview_member.dart';
import '../districts.dart';

class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({required this.member, super.key});

  final PreviewMember member;

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  Uint8List? _photoBytes;
  bool _pickingPhoto = false;

  @override
  void initState() {
    super.initState();
    _photoBytes = widget.member.photoBytes;
  }

  Future<void> _choosePhoto() async {
    setState(() => _pickingPhoto = true);
    try {
      final selected = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        maxWidth: 1200,
        maxHeight: 1200,
      );
      if (selected == null) return;
      final bytes = await selected.readAsBytes();
      if (!mounted) return;
      if (bytes.length > 8 * 1024 * 1024) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Choose a photo smaller than 8 MB.')),
        );
        return;
      }
      setState(() => _photoBytes = bytes);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not open that photo.')),
        );
      }
    } finally {
      if (mounted) setState(() => _pickingPhoto = false);
    }
  }

  late final Map<String, TextEditingController> _fields = {
    'name': TextEditingController(text: widget.member.name),
    'education': TextEditingController(text: widget.member.education),
    'university': TextEditingController(text: widget.member.university),
    'phone': TextEditingController(text: widget.member.phone),
    'email': TextEditingController(text: widget.member.email),
    'bloodGroup': TextEditingController(text: widget.member.bloodGroup),
    'homeDistrict': TextEditingController(text: widget.member.homeDistrict),
    'aboutMe': TextEditingController(text: widget.member.aboutMe),
    'favouriteQuotation': TextEditingController(
      text: widget.member.favouriteQuotation,
    ),
  };

  @override
  void dispose() {
    for (final controller in _fields.values) {
      controller.dispose();
    }
    super.dispose();
  }

  String value(String key) => _fields[key]!.text.trim();

  Widget field(
    String key,
    String label, {
    bool required = true,
    int maxLines = 1,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: TextFormField(
        controller: _fields[key],
        maxLines: maxLines,
        keyboardType: key == 'email'
            ? TextInputType.emailAddress
            : TextInputType.text,
        decoration: InputDecoration(labelText: label),
        validator: (text) {
          final trimmed = text?.trim() ?? '';
          if (required && trimmed.isEmpty) return '$label is required';
          if (key == 'email' &&
              !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(trimmed)) {
            return 'Enter a valid email address';
          }
          return null;
        },
      ),
    );
  }

  void save() {
    if (!_formKey.currentState!.validate()) return;
    Navigator.of(context).pop(
      PreviewMember(
        name: value('name'),
        ftcId: widget.member.ftcId,
        section: widget.member.section,
        cadre: widget.member.cadre,
        bcsBatch: widget.member.bcsBatch,
        education: value('education'),
        university: value('university'),
        phone: value('phone'),
        email: value('email'),
        bloodGroup: value('bloodGroup'),
        homeDistrict: value('homeDistrict'),
        aboutMe: value('aboutMe'),
        favouriteQuotation: value('favouriteQuotation'),
        photoBytes: _photoBytes,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Edit preview profile')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 700),
          child: Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(16),
                    child: Text(
                      'Preview only. Saving here updates this screen temporarily; it does not change the database.',
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Card(
                  child: Column(
                    children: [
                      if (_photoBytes != null)
                        Padding(
                          padding: const EdgeInsets.all(12),
                          child: Image.memory(
                            _photoBytes!,
                            height: 120,
                            fit: BoxFit.cover,
                          ),
                        ),
                      ListTile(
                        leading: const Icon(Icons.add_a_photo_outlined),
                        title: const Text('Profile photo'),
                        subtitle: const Text(
                          'Demo photos stay only in memory on this device.',
                        ),
                        trailing: TextButton(
                          onPressed: _pickingPhoto ? null : _choosePhoto,
                          child: const Text('Choose'),
                        ),
                      ),
                      if (_photoBytes != null)
                        TextButton(
                          onPressed: () => setState(() => _photoBytes = null),
                          child: const Text('Remove demo photo'),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                field('name', 'Name'),
                field('education', 'Education'),
                field('university', 'University'),
                field('phone', 'WhatsApp contact'),
                field('email', 'Email'),
                field('bloodGroup', 'Blood group'),
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: DropdownButtonFormField<String>(
                    initialValue:
                        bangladeshDistricts.contains(
                          _fields['homeDistrict']!.text,
                        )
                        ? _fields['homeDistrict']!.text
                        : null,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Home district',
                    ),
                    items: [
                      for (final district in bangladeshDistricts)
                        DropdownMenuItem(
                          value: district,
                          child: Text(district),
                        ),
                    ],
                    onChanged: (district) =>
                        _fields['homeDistrict']!.text = district ?? '',
                    validator: (value) =>
                        value == null ? 'Choose a district' : null,
                  ),
                ),
                field('aboutMe', 'About me', required: false, maxLines: 3),
                field(
                  'favouriteQuotation',
                  'Favourite quotation',
                  required: false,
                  maxLines: 3,
                ),
                FilledButton(
                  onPressed: save,
                  child: const Text('Save preview changes'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
