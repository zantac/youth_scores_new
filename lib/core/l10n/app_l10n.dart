class L10n {
  final String locale;
  const L10n(this.locale);

  bool get isAr => locale == 'ar';

  // App
  String get appName       => isAr ? 'بطولات الناشئين'          : 'Youth Scores';
  String get seasons       => isAr ? 'المواسم'             : 'Seasons';
  String get competitions  => isAr ? 'البطولات'            : 'Competitions';
  String get ageGroups     => isAr ? 'الفئات العمرية'      : 'Age Groups';
  String get matches       => isAr ? 'المباريات'           : 'Matches';
  String get standings     => isAr ? 'الترتيب'             : 'Standings';
  String get teams         => isAr ? 'الفرق'               : 'Teams';
  String get statistics    => isAr ? 'الإحصائيات'          : 'Statistics';
  String get news          => isAr ? 'الأخبار'             : 'News';
  String get clubs         => isAr ? 'الأندية'             : 'Clubs';
  String get venues        => isAr ? 'الملاعب'             : 'Venues';
  String get ads           => isAr ? 'الإعلانات'           : 'Ads';
  String get about         => isAr ? 'من نحن'              : 'About';
  String get home          => isAr ? 'الرئيسية'            : 'Home';
  String get todaysMatches => isAr ? 'مباريات اليوم'       : "Today's Matches";
  String get more          => isAr ? 'المزيد ›'             : 'More ›';
  String get contactUs     => isAr ? 'تواصل معنا'          : 'Contact Us';
  String get moreLabel     => isAr ? 'المزيد'               : 'More';
  String get connect       => isAr ? 'تواصل معنا'          : 'Contact Us';
  String get favorites     => isAr ? 'المفضلة'             : 'Favourites';

  // Match status
  String get completed     => isAr ? 'انتهت'               : 'Completed';
  String get upcoming      => isAr ? 'قادمة'               : 'Upcoming';
  String get live          => isAr ? 'مباشر'               : 'Live';
  String get postponed     => isAr ? 'مؤجلة'               : 'Postponed';

  // Match detail
  String get scorers       => isAr ? 'الهدافون'            : 'Scorers';
  String get assists       => isAr ? 'صناعة الأهداف'       : 'Assists';
  String get yellowCards   => isAr ? 'البطاقات الصفراء'    : 'Yellow Cards';
  String get redCards      => isAr ? 'البطاقات الحمراء'    : 'Red Cards';
  String get substitutions => isAr ? 'التبديلات'           : 'Substitutions';
  String get lineup        => isAr ? 'التشكيلة'            : 'Lineup';
  String get homeTeam      => isAr ? 'ديار'                : 'Home';
  String get awayTeam      => isAr ? 'ضيف'                 : 'Away';
  String get vs            => isAr ? 'ضد'                  : 'VS';
  String get venue         => isAr ? 'الملعب'              : 'Venue';
  String get week          => isAr ? 'الجولة'              : 'Week';
  String get group         => isAr ? 'المجموعة'            : 'Group';
  String get stage         => isAr ? 'المرحلة'             : 'Stage';
  String get note          => isAr ? 'ملاحظة'              : 'Note';

  // Team detail
  String get coach         => isAr ? 'المدرب'              : 'Coach';
  String get coachingStaff => isAr ? 'الجهاز الفني'        : 'Coaching Staff';
  String get pointDeduction => isAr ? 'خصم النقاط'         : 'Point Deduction';
  String get goalkeepers   => isAr ? 'حراس المرمى'         : 'Goalkeepers';
  String get defenders     => isAr ? 'المدافعون'           : 'Defenders';
  String get midfielders   => isAr ? 'لاعبو الوسط'         : 'Midfielders';
  String get attackers     => isAr ? 'المهاجمون'           : 'Attackers';
  String get city          => isAr ? 'المدينة'             : 'City';
  String get field         => isAr ? 'الملعب'              : 'Field';
  String get information   => isAr ? 'معلومات'             : 'Information';
  String get squad         => isAr ? 'قائمة اللاعبين'      : 'Squad';
  String get teamMatches   => isAr ? 'مباريات الفريق'      : 'Team Matches';

  // Standings headers
  String get pos           => isAr ? '#'                   : '#';
  String get teamCol       => isAr ? 'الفريق'              : 'Team';
  String get played        => isAr ? 'ل'                   : 'P';
  String get won           => isAr ? 'ف'                   : 'W';
  String get drawn         => isAr ? 'ت'                   : 'D';
  String get lost          => isAr ? 'خ'                   : 'L';
  String get gf            => isAr ? 'له'                  : 'GF';
  String get ga            => isAr ? 'عليه'                : 'GA';
  String get gd            => isAr ? 'فارق'                : 'GD';
  String get points        => isAr ? 'نقط'                 : 'Pts';

  // Stats
  String get topScorers    => isAr ? 'هدافو البطولة'       : 'Top Scorers';
  String get cards         => isAr ? 'البطاقات'            : 'Cards';
  String get yellowCardsLabel => isAr ? 'بطاقات صفراء'     : 'Yellow Cards';
  String get redCardsLabel    => isAr ? 'بطاقات حمراء'     : 'Red Cards';
  String get yellowCardUnit   => isAr ? 'ص'                : 'YC';
  String get redCardUnit      => isAr ? 'ح'                : 'RC';
  String get topAssisters  => isAr ? 'صناع الأهداف'        : 'Top Assisters';
  String get cleanSheets   => isAr ? 'شباك نظيفة'          : 'Clean Sheets';
  String get goals         => isAr ? 'أهداف'               : 'Goals';
  String get noStats       => isAr ? 'لا توجد إحصائيات'   : 'No statistics yet';

  // General
  String get loading       => isAr ? 'جاري التحميل...'     : 'Loading...';
  String get noData        => isAr ? 'لا توجد بيانات'      : 'No data available';
  String get noMatches     => isAr ? 'لا توجد مباريات'     : 'No matches';
  String get noNews        => isAr ? 'لا توجد أخبار'       : 'No news available';
  String get noTeams       => isAr ? 'لا توجد فرق'         : 'No teams';
  String get error         => isAr ? 'خطأ'                  : 'Error';
  String get retry         => isAr ? 'إعادة المحاولة'      : 'Retry';
  String get search        => isAr ? 'بحث...'              : 'Search...';
  String get share              => isAr ? 'مشاركة'              : 'Share';
  String get shareStandings     => isAr ? 'مشاركة الترتيب'     : 'Share standings';
  String get shareStandingsErr  => isAr ? 'تعذّر مشاركة الترتيب' : 'Could not share standings';
  String get close         => isAr ? 'إغلاق'               : 'Close';
  String get version       => isAr ? 'الإصدار'             : 'Version';
  String get today         => isAr ? 'اليوم'               : 'Today';
  String get tomorrow      => isAr ? 'غداً'                : 'Tomorrow';
  String get yesterday     => isAr ? 'أمس'                 : 'Yesterday';
  String get openMap       => isAr ? 'فتح الخريطة'         : 'Open Map';
  String get call          => isAr ? 'اتصال'               : 'Call';
  String get whatsapp      => isAr ? 'واتساب'              : 'WhatsApp';
  String get facebook      => isAr ? 'فيسبوك'              : 'Facebook';
  String get youtube       => isAr ? 'يوتيوب'              : 'YouTube';
  String get newUpdate     => isAr ? 'تحديث جديد'          : 'New Update';
  String get updateNow     => isAr ? 'تحديث الآن'          : 'Update Now';
  String get later         => isAr ? 'لاحقاً'              : 'Later';
  String get selectSeason  => isAr ? 'اختر الموسم'         : 'Select Season';
  String get switchLang    => isAr ? 'English'              : 'عربي';

  // Team detail page tabs
  String get tabInfo       => isAr ? 'المعلومات'            : 'Info';
  String get tabSquad      => isAr ? 'اللاعبون'             : 'Squad';
  String get tabScorers    => isAr ? 'الهدافون'             : 'Scorers';
  String get tabAssists    => isAr ? 'صناعة الاهداف'        : 'Assists';
  String get tabStats      => isAr ? 'الاحصائيات'           : 'Stats';

  // Competition stats page
  String get statsOverview     => isAr ? 'إحصائيات'          : 'Overview';
  String get completedLabel    => isAr ? 'منتهية'            : 'Completed';
  String get goalRateLabel     => isAr ? 'معدل الأهداف'      : 'Goals/Match';
  String get decisiveMatches   => isAr ? 'مباريات حسم'       : 'Decisive';
  String get drawMatchesLabel  => isAr ? 'مباريات تعادل'     : 'Draws';
  String get attackRankings    => isAr ? 'الهجوم'            : 'Attack';
  String get defenseRankings   => isAr ? 'الدفاع'            : 'Defense';
  String get bestAttackLabel   => isAr ? 'أقوى هجوم'         : 'Best Attack';
  String get worstAttackLabel  => isAr ? 'أضعف هجوم'         : 'Worst Attack';
  String get bestDefenseLabel  => isAr ? 'أقوى دفاع'         : 'Best Defense';
  String get worstDefenseLabel => isAr ? 'أضعف دفاع'         : 'Worst Defense';
  String get goalsUnit         => isAr ? 'هدف'               : 'Goal';
  String get assistUnit        => isAr ? 'صناعة'             : 'Assist';
  String get cleanSheetUnit    => isAr ? 'شباك نظيفة'        : 'CS';
  String get concededUnit      => isAr ? 'استقبل'            : 'conceded';

  // Team statistics section
  String get matchResults  => isAr ? 'نتائج المباريات'      : 'Match Results';
  String get totalMatches  => isAr ? 'إجمالي'               : 'Total';
  String get winLabel      => isAr ? 'فوز'                  : 'Win';
  String get drawLabel     => isAr ? 'تعادل'                : 'Draw';
  String get lossLabel     => isAr ? 'خسارة'                : 'Loss';
  String get goalsScored   => isAr ? 'أهداف مسجلة'          : 'Goals Scored';
  String get goalsConceded => isAr ? 'أهداف مستقبلة'        : 'Goals Conceded';
  String get perMatch      => isAr ? 'لكل مباراة'           : 'per match';

  // Info pages
  String get privacyPolicy => isAr ? 'سياسة الخصوصية'  : 'Privacy Policy';
  String get terms         => isAr ? 'الشروط والأحكام' : 'Terms & Conditions';
  String get lastUpdated   => isAr ? 'آخر تحديث'        : 'Last updated';

  String matchStatus(String status) {
    switch (status.toLowerCase()) {
      case 'completed': return completed;
      case 'live':      return live;
      case 'postponed': return postponed;
      default:          return upcoming;
    }
  }
}
