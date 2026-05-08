CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  beasts text[] := ARRAY['饕餮','穷奇','梼杌','混沌','烛龙','毕方','九尾','应龙','重明','鲲','鹏','白泽','麒麟','化蛇','陆吾','英招','钦原','蛊雕','凤凰','朱雀','玄武','青龙','驺虞','犼','睚眦','狻猊','貔貅','狴犴','蒲牢','嘲风','椒图','负屃','螭吻','赑屃','囚牛'];
  guest_flag boolean;
  proposed text;
  proposed_pet text;
BEGIN
  guest_flag := coalesce((new.raw_user_meta_data->>'is_guest')::boolean, false)
                OR new.email IS NULL OR new.email = '';

  proposed := nullif(trim(coalesce(new.raw_user_meta_data->>'display_name','')), '');

  proposed_pet := nullif(trim(coalesce(new.raw_user_meta_data->>'pet_name','')), '');
  IF proposed_pet IS NULL THEN
    proposed_pet := beasts[1 + floor(random() * array_length(beasts,1))::int];
  END IF;

  INSERT INTO public.profiles(id, display_name, is_guest, last_active_at)
  VALUES (new.id, proposed, guest_flag, now());

  INSERT INTO public.pets(user_id, name, species)
  VALUES (new.id, proposed_pet, proposed_pet);

  RETURN new;
END;
$function$;